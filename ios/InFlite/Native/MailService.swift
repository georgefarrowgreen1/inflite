import Foundation

enum MailLens: String, CaseIterable, Identifiable {
    case people, updates, later, done

    var id: Self { self }
    var title: String { rawValue.capitalized }
    var view: String { self == .people || self == .updates ? "all" : rawValue }
    var category: String? { self == .people || self == .updates ? rawValue : nil }

    var emptyText: String {
        switch self {
        case .people: "All caught up"
        case .updates: "No updates waiting"
        case .later: "Nothing in Later"
        case .done: "Nothing marked Done"
        }
    }
}

struct MailPerson: Decodable {
    let name: String
    let email: String

    var label: String {
        if !name.isEmpty { return name }
        return email.isEmpty ? "Unknown sender" : email
    }
}

struct MailBrief: Decodable, Identifiable {
    let id: String
    let from: MailPerson
    let subject: String
    let snippet: String
    let date: Int64
    let hasAttachments: Bool
}

struct MailConversation: Decodable, Identifiable {
    let id: String
    let subject: String
    let from: MailPerson?
    let latest: MailBrief?
    let date: Int64
    let sort: Int64
    let unread: Int
    let hasAttachments: Bool
}

struct MailPage: Decodable {
    let threads: [MailConversation]
    let drafts: [MailBrief]
    let hasMore: Bool
}

struct MailThreadPage: Decodable {
    let messages: [MailBrief]
    let nextAfter: String?
}

struct MailAttachment: Decodable, Identifiable {
    let id: String
    let filename: String
    let size: Int64
}

struct MailMessage: Decodable {
    let from: MailPerson
    let date: Int64
    let text: String
    let attachments: [MailAttachment]
}

enum MailAccess: String, Decodable {
    case ok, signin, notadmin, passkey, reauth

    var title: String {
        switch self {
        case .ok: "Mail"
        case .signin: "Sign in to Mail"
        case .notadmin: "Mail access is restricted"
        case .passkey: "Set up a passkey"
        case .reauth: "Confirm it’s you"
        }
    }

    var message: String {
        switch self {
        case .ok: ""
        case .signin: "Open Mail to sign in to your InFlite account."
        case .notadmin: "Mail is available to the InFlite administrator."
        case .passkey: "Mail requires a passkey to protect your inbox."
        case .reauth: "Verify your identity to open your inbox again."
        }
    }
}

enum MailServiceError: LocalizedError {
    case invalidMessage, accountChanged, saveFailed, invalidRecipient

    var errorDescription: String? {
        switch self {
        case .invalidMessage: "Couldn’t open this message."
        case .accountChanged: "Your Mail account changed. Open Mail again to continue."
        case .saveFailed: "Couldn’t save the draft."
        case .invalidRecipient: "Enter a valid email address in To."
        }
    }
}

struct MailService {
    let owner: String

    private struct Account: Decodable { let id: String }
    private struct Session: Decodable {
        let access: MailAccess
        let user: Account?
    }
    private struct Identity: Decodable {
        let defaultFrom: String
        let account: Account
    }
    private struct Search: Encodable {
        let q: String
        let view: String
        let category: String?
        let before: Int64?
    }
    private struct Draft: Encodable {
        let id: String
        let accountOwner: String
        let from: String
        let to: [String]
        let subject: String
        let text: String
    }
    private struct Send: Encodable {
        let draftId: String
        let key: String
        let accountOwner: String
    }
    private struct Action: Encodable { let action: String }
    private struct Acknowledgement: Decodable { let ok: Bool }
    private struct SavedMessage: Decodable {
        let ok: Bool
        let id: String
    }

    func access() async throws -> MailAccess {
        let result = try await request(Session.self, path: "/api/session")
        guard result.user == nil || result.user?.id == owner else { throw MailServiceError.accountChanged }
        guard result.access != .ok || result.user?.id == owner else { throw MailServiceError.accountChanged }
        return result.access
    }

    func conversations(_ lens: MailLens, search: String, before: Int64? = nil) async throws -> MailPage {
        if !search.isEmpty {
            return try await request(
                MailPage.self, path: "/api/threads/search", method: "POST",
                body: JSONEncoder().encode(Search(q: search, view: lens.view, category: lens.category, before: before))
            )
        }
        var query = [URLQueryItem(name: "view", value: lens.view)]
        if lens == .later { query.append(URLQueryItem(name: "limit", value: "100")) }
        if let category = lens.category { query.append(URLQueryItem(name: "category", value: category)) }
        if let before { query.append(URLQueryItem(name: "before", value: String(before))) }
        return try await request(MailPage.self, path: "/api/threads", query: query)
    }

    func thread(_ id: String, after: String? = nil) async throws -> MailThreadPage {
        let query = after.map { [URLQueryItem(name: "after", value: $0)] } ?? [URLQueryItem(name: "paged", value: "1")]
        return try await request(MailThreadPage.self, path: "/api/threads/\(Self.messageID(id))", query: query)
    }

    func message(_ id: String) async throws -> MailMessage {
        // This model decodes plain text only. The HTML, inline images and links in the
        // server payload are never rendered or loaded by the native reader.
        try await request(MailMessage.self, path: "/api/messages/\(Self.messageID(id))")
    }

    func markRead(_ id: String) async throws {
        let _: Acknowledgement = try await request(
            Acknowledgement.self, path: "/api/threads/\(Self.messageID(id))", method: "POST",
            body: JSONEncoder().encode(Action(action: "read"))
        )
    }

    func fromAddress() async throws -> String {
        let identity = try await request(Identity.self, path: "/api/me")
        guard identity.account.id == owner else { throw MailServiceError.accountChanged }
        return identity.defaultFrom
    }

    func saveDraft(id: String, from: String, recipients: [String], subject: String, text: String) async throws -> String {
        let draft = Draft(id: id, accountOwner: owner, from: from, to: recipients, subject: subject, text: text)
        let result = try await request(
            SavedMessage.self, path: "/api/drafts", method: "POST", body: JSONEncoder().encode(draft)
        )
        guard result.ok else { throw MailServiceError.saveFailed }
        return result.id
    }

    func send(draft id: String, key: String) async throws {
        let send = Send(draftId: id, key: key, accountOwner: owner)
        let result = try await request(
            SavedMessage.self, path: "/api/send", method: "POST", body: JSONEncoder().encode(send)
        )
        guard result.ok else { throw MailServiceError.saveFailed }
    }

    private static func messageID(_ id: String) throws -> String {
        guard id.range(of: #"^[A-Za-z0-9_-]{1,64}$"#, options: .regularExpression) != nil else {
            throw MailServiceError.invalidMessage
        }
        return id
    }

    private func request<Response: Decodable>(
        _ response: Response.Type, path: String, method: String = "GET",
        query: [URLQueryItem] = [], body: Data? = nil
    ) async throws -> Response {
        try await BackendClient.shared.request(response, path: path, method: method, query: query, body: body, owner: owner, origin: .mail)
    }
}
