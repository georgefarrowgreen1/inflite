import Foundation

enum MailLens: String, CaseIterable, Identifiable {
    case people, updates, later, done, unread, flagged, attachments, trash

    static let primary: [Self] = [.people, .updates, .later, .done]

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
        case .unread: "Nothing unread"
        case .flagged: "Nothing flagged"
        case .attachments: "No conversations with attachments"
        case .trash: "Trash is empty"
        }
    }
}

struct MailPerson: Codable {
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
    let starred: Bool?
    let done: Bool?
    let trashed: Bool?
    let snoozeUntil: Int64?
}

struct MailPage: Decodable {
    let threads: [MailConversation]
    let drafts: [MailBrief]
    let hasMore: Bool
    let nextLater: String?
}

struct MailThreadPage: Decodable {
    let messages: [MailBrief]
    let nextAfter: String?
}

struct MailOpenedConversation: Decodable {
    let conversation: MailConversation
    let page: MailThreadPage

    init(from decoder: Decoder) throws {
        conversation = try MailConversation(from: decoder)
        page = try MailThreadPage(from: decoder)
    }
}

struct MailAttachment: Decodable, Identifiable, Equatable {
    let id: String
    let filename: String
    let size: Int64
    let type: String?
}

struct MailMessage: Decodable {
    let id: String
    let from: MailPerson
    let to: [MailPerson]
    let cc: [MailPerson]
    let subject: String
    let folder: String
    let mailbox: String?
    let replyTo: String?
    let messageId: String?
    let references: MailReferences?
    let date: Int64
    let text: String
    let html: String?
    let attachments: [MailAttachment]
    let inlineAttachments: [MailAttachment]?
}

struct MailIdentity: Decodable {
    struct Account: Decodable { let id: String }
    let defaultFrom: String
    let identities: [String]
    let account: Account
}

struct MailQuote: Codable {
    let of: String
    let mode: String
}

struct MailReferences: Codable {
    private let value: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else {
            value = try container.decode([String].self).joined(separator: " ")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

struct MailDraft: Decodable {
    struct Fields: Decodable {
        let from: String
        let to: [MailPerson]
        let cc: [MailPerson]
        let bcc: [MailPerson]
        let subject: String
        let text: String
        let inReplyTo: String?
        let references: MailReferences?
        let quote: MailQuote?
        let files: [MailDraftFile]
    }

    let id: String
    let compose: Fields
    let quoteOld: Bool
}

struct MailDraftFile: Codable, Identifiable, Sendable {
    static let maximumBytes = 25 * 1024 * 1024
    static let maximumFiles = 20

    let id = UUID()
    let i: Int?
    let ref: String?
    let filename: String
    let type: String
    let size: Int64
    var content: Data? = nil

    private enum CodingKeys: String, CodingKey {
        case i, ref, filename, type, size, content
    }

    init(reference file: MailAttachment) {
        i = nil
        ref = file.id
        filename = file.filename
        type = file.type ?? "application/octet-stream"
        size = file.size
    }

    init(filename: String, type: String, content: Data) {
        i = nil
        ref = nil
        self.filename = filename
        self.type = type
        size = Int64(content.count)
        self.content = content
    }
}

struct MailDraftInput: Encodable {
    let id: String
    let accountOwner: String
    let from: String
    let to: [MailPerson]
    let cc: [MailPerson]
    let bcc: [MailPerson]
    let subject: String
    let text: String
    let inReplyTo: String?
    let references: MailReferences?
    let quote: MailQuote?
    let attachments: [MailDraftFile]
}

enum MailThreadAction: String, Encodable {
    case read, unread, flag, unflag, done, inbox, snooze, unsnooze, trash, restore
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
        case .signin: "Verify your InFlite account to open Mail."
        case .notadmin: "Mail is available to the InFlite administrator."
        case .passkey: "Mail requires a passkey to protect your inbox."
        case .reauth: "Verify your identity to open your inbox again."
        }
    }
}

enum MailServiceError: LocalizedError {
    case invalidMessage, accountChanged, saveFailed, invalidRecipient, tooManyFiles, attachmentTooLarge, invalidAttachment

    var errorDescription: String? {
        switch self {
        case .invalidMessage: "Couldn’t open this message."
        case .accountChanged: "Your Mail account changed. Open Mail again to continue."
        case .saveFailed: "Couldn’t save the draft."
        case .invalidRecipient: "Enter between 1 and 50 valid email addresses."
        case .tooManyFiles: "You can add up to 20 attachments."
        case .attachmentTooLarge: "Attachments can be 25 MB in total."
        case .invalidAttachment: "Couldn’t open this attachment."
        }
    }
}

struct MailService {
    let owner: String

    private struct Session: Decodable {
        let access: MailAccess
        let user: MailIdentity.Account?
    }
    private struct Search: Encodable {
        let q: String
        let view: String
        let category: String?
        let before: Int64?
    }
    private struct Send: Encodable {
        let draftId: String
        let key: String
        let accountOwner: String
    }
    private struct Action: Encodable {
        let action: MailThreadAction
        let until: Int64?
    }
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

    func conversations(_ lens: MailLens, search: String, before: Int64? = nil, later: String? = nil) async throws -> MailPage {
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
        if let later { query.append(URLQueryItem(name: "later", value: later)) }
        return try await request(MailPage.self, path: "/api/threads", query: query)
    }

    func thread(_ id: String, after: String? = nil) async throws -> MailThreadPage {
        let query = after.map { [URLQueryItem(name: "after", value: $0)] } ?? [URLQueryItem(name: "paged", value: "1")]
        return try await request(MailThreadPage.self, path: "/api/threads/\(Self.messageID(id))", query: query)
    }

    func openConversation(_ id: String) async throws -> MailOpenedConversation {
        let result = try await request(
            MailOpenedConversation.self, path: "/api/threads/\(Self.messageID(id))",
            query: [URLQueryItem(name: "paged", value: "1")]
        )
        guard result.conversation.id == id else { throw MailServiceError.invalidMessage }
        return result
    }

    func message(_ id: String) async throws -> MailMessage {
        try await request(MailMessage.self, path: "/api/messages/\(Self.messageID(id))")
    }

    func attachment(_ file: MailAttachment) async throws -> Data {
        guard file.size >= 0, file.size <= MailDraftFile.maximumBytes else { throw MailServiceError.attachmentTooLarge }
        let data = try await BackendClient.shared.data(
            path: "/api/attachments/\(Self.messageID(file.id))", query: [.init(name: "download", value: "1")],
            owner: owner, origin: .mail
        )
        guard data.count <= MailDraftFile.maximumBytes else { throw MailServiceError.attachmentTooLarge }
        return data
    }

    func act(_ action: MailThreadAction, on id: String, until: Date? = nil) async throws {
        let result: Acknowledgement = try await request(
            Acknowledgement.self, path: "/api/threads/\(Self.messageID(id))", method: "POST",
            body: JSONEncoder().encode(Action(action: action, until: until.map { Int64($0.timeIntervalSince1970 * 1000) }))
        )
        guard result.ok else { throw BackendError.invalidResponse }
    }

    func identity() async throws -> MailIdentity {
        let identity = try await request(MailIdentity.self, path: "/api/me")
        guard identity.account.id == owner else { throw MailServiceError.accountChanged }
        return identity
    }

    func draft(_ id: String) async throws -> MailDraft {
        try await request(MailDraft.self, path: "/api/drafts/\(Self.messageID(id))")
    }

    func saveDraft(_ draft: MailDraftInput) async throws -> String {
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
