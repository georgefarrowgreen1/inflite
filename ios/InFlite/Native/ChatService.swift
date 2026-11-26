import CryptoKit
import Foundation

struct ChatPublicKey: Decodable, Equatable {
    let kty: String
    let crv: String
    let x: String
    let y: String

    var fingerprint: String { "\(x).\(y)" }

    func agreementKey() throws -> P256.KeyAgreement.PublicKey {
        guard kty == "EC", crv == "P-256",
              let x = ChatCrypto.decodeURL(x), let y = ChatCrypto.decodeURL(y),
              x.count == 32, y.count == 32 else { throw ChatError.keyUnavailable }
        return try P256.KeyAgreement.PublicKey(x963Representation: Data([4]) + x + y)
    }

    init?(fingerprint: String) {
        let parts = fingerprint.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        kty = "EC"
        crv = "P-256"
        x = String(parts[0])
        y = String(parts[1])
    }
}

struct ChatPerson: Decodable, Identifiable {
    let id: String
    let name: String?
    let handle: String
    let pub: ChatPublicKey?
    let last: ChatWireMessage?
    let unread: Int?
    let way: String?

    var displayName: String { name ?? "@\(handle)" }
}

struct ChatGroup: Decodable, Identifiable {
    let id: String
    let name: String
    let members: [ChatPerson]
    let last: ChatWireMessage?
    let unread: Int
    let way: String
}

struct ChatIdentity: Decodable {
    let id: String
    let pub: ChatPublicKey
    let pigeons: Bool
}

struct ChatWireMessage: Decodable {
    let id: String
    let from: String
    let to: String?
    let gid: String?
    let ct: String?
    let body: String?
    let key: String?
    let sentAt: Double
    let deliverAt: Double?
    let readAt: Double?
    let photo: Int?
    let once: Bool?
    let viewedAt: Double?
    let vanish: Double?
    let flying: Bool?
    let waiting: Bool?
    let lost: Bool?
    let recalled: Bool?
    let stopover: Bool?

    var date: Date { Date(timeIntervalSince1970: sentAt / 1_000) }
}

struct ChatMediaKey: Codable {
    struct FileMetadata: Codable {
        let n: String
        let m: String?
        let s: Int?
    }

    let k: String
    let iv: String
    let f: FileMetadata?
}

struct ChatDraftAttachment: Identifiable {
    static let maximumSize = 8 * 1024 * 1024 - 16

    let id = UUID()
    let data: Data
    let file: ChatMediaKey.FileMetadata?

    var title: String { file?.n ?? "Photo" }

    init(data: Data, name: String? = nil, mediaType: String? = nil) throws {
        guard !data.isEmpty, data.count <= Self.maximumSize else { throw ChatError.attachmentSize }
        self.data = data
        file = name.map { ChatMediaKey.FileMetadata(n: Self.safeName($0), m: mediaType, s: data.count) }
    }

    static func safeName(_ name: String) -> String {
        let excluded = CharacterSet.controlCharacters.union(CharacterSet(charactersIn: "/\\\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}"))
        let clean = name.components(separatedBy: excluded).joined(separator: "_")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty || clean == "." || clean == ".." ? "Chat attachment" : String(clean.prefix(180))
    }
}

struct ChatMessage: Identifiable {
    let wire: ChatWireMessage
    let text: String
    let media: ChatMediaKey?
    let voice: Bool
    let couldDecrypt: Bool

    var id: String { wire.id }
}

struct ChatThread: Identifiable, Hashable {
    let id: String
    let group: Bool
    let name: String
    let subtitle: String
    let last: ChatMessage?
    let unread: Int
    let sendByPigeon: Bool
    let keyChanged: Bool

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id && lhs.group == rhs.group }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(group)
    }
}

struct ChatOverview {
    let threads: [ChatThread]
    let friends: [ChatPerson]
    let incoming: [ChatPerson]
    let outgoing: [ChatPerson]
    let pigeons: Bool
}

struct ChatSafetyNumber: Identifiable {
    let id: String
    let name: String
    let number: String
    let fingerprint: String
    let changed: Bool
}

enum ChatError: LocalizedError {
    case locked, keyUnavailable, identityChanged, contactChanged, invalidMessage, unavailable, attachmentSize

    var errorDescription: String? {
        switch self {
        case .locked: "Unlock Chats to continue."
        case .keyUnavailable: "This device couldn’t unlock your encryption key."
        case .identityChanged: "Your Chats encryption key changed. Lock Chats and unlock it again to continue."
        case .contactChanged: "A security key changed. Compare safety numbers before sending."
        case .invalidMessage: "This encrypted message couldn’t be opened."
        case .unavailable: "This conversation is no longer available."
        case .attachmentSize: "Choose a photo or file smaller than 8 MB."
        }
    }
}

private struct ChatSync: Decodable {
    let me: ChatIdentity
    let friends: [ChatPerson]
    let groups: [ChatGroup]
    let incoming: [ChatPerson]
    let outgoing: [ChatPerson]
}

private struct ChatHistory: Decodable {
    let now: Double
    let messages: [ChatWireMessage]
}

private struct ChatSendReply: Decodable {
    let message: ChatWireMessage
}

private struct ChatOK: Decodable {
    let ok: Bool
}

private struct ChatAccount: Decodable {
    let signedIn: Bool
    let id: String?
    let salt: String?
}

private struct ChatHandback: Decodable {
    let code: String
}

private struct ChatEnrollment: Decodable {
    let token: String
    let me: ChatIdentity
    let vault: String
    let box: String
}

private enum ChatPin: Codable, Equatable {
    case single(String), history([String])

    var value: String? {
        if case .single(let value) = self { value } else { nil }
    }

    var all: [String] {
        switch self {
        case .single(let value): [value]
        case .history(let values): values
        }
    }

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let single = try? value.decode(String.self) {
            self = .single(single)
        } else {
            self = .history(try value.decode([String].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .single(let value): try container.encode(value)
        case .history(let history): try container.encode(history)
        }
    }
}

private struct ChatPinEnvelope: Codable {
    let pins: [String: ChatPin]
}

private struct ChatStoredPins: Codable {
    let pins: String?
}

struct ChatBody: Decodable {
    let t: String
    let p: ChatMediaKey?
    let v: ChatMediaKey?
    let r: String?
    let k: String?

}

private struct ChatMessageBody: Encodable {
    let t: String
    let p: ChatMediaKey?
    let z: String
}

private struct ChatWrap: Codable {
    let k: String
    let h: String?
}

private struct ChatSendBody: Encodable {
    let id: String
    let to: String?
    let ct: String?
    let group: String?
    let body: String?
    let keys: [String: String]?
    let instant: Bool
    let pigeon: String?
    let once: Bool?
}

actor ChatService {
    private struct Session {
        let token: String
        let privateKey: P256.KeyAgreement.PrivateKey
        let pub: ChatPublicKey
    }

    private let owner: String
    private let backend: BackendClient
    private var session: Session?
    private var snapshot: ChatSync?
    private var pins: [String: ChatPin] = [:]
    private var generation = 0

    init(owner: String, backend: BackendClient = .shared) {
        self.owner = owner
        self.backend = backend
    }

    func unlock(password: String) async throws -> ChatOverview {
        if session != nil { return try await overview() }
        generation += 1
        let revision = generation
        let account = try await backend.request(ChatAccount.self, path: "/api/account/me", owner: owner, origin: .auth)
        guard account.signedIn, account.id == owner, let salt = account.salt else { throw BackendError.accountChanged }
        let password = try await BackendPassword.derive(password, salt: salt)
        try check(revision)
        let proof = try JSONEncoder().encode(["proof": password.proof])
        let verified = try await backend.request(ChatOK.self, path: "/api/account/reauth", method: "POST",
                                                 body: proof, owner: owner, origin: .auth)
        guard verified.ok else { throw BackendError.invalidResponse }
        try check(revision)

        let transferKey = P256.KeyAgreement.PrivateKey()
        let verifier = ChatCrypto.encodeURL(ChatCrypto.randomKey())
        let ask = ChatCrypto.encodeURL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let sealed = try ChatCrypto.sealHandback(password.lockKey, to: transferKey.publicKey)
        let handback = try await backend.request(ChatHandback.self, path: "/api/account/handback", method: "POST",
                                                 body: JSONEncoder().encode(["app": "inflight", "ask": ask, "box": sealed]),
                                                 owner: owner, origin: .auth)
        try check(revision)
        let requestBody = try JSONEncoder().encode(["code": handback.code, "verifier": verifier])
        let enrollmentData = try await backend.chatData(path: "handback", method: "POST", body: requestBody, owner: owner)
        let enrollment = try JSONDecoder().decode(ChatEnrollment.self, from: enrollmentData)
        do {
            try check(revision)
            guard enrollment.me.id == owner else { throw BackendError.accountChanged }
            let lockKey = try ChatCrypto.openHandback(enrollment.box, with: transferKey)
            let privateKey = try ChatCrypto.openVault(enrollment.vault, key: lockKey)
            guard privateKey.publicKey.x963Representation == (try enrollment.me.pub.agreementKey()).x963Representation else {
                throw ChatError.keyUnavailable
            }
            session = Session(token: enrollment.token, privateKey: privateKey, pub: enrollment.me.pub)
            pins = try await storedPins()
            try check(revision)
            return try await overview()
        } catch {
            if session?.token == enrollment.token { clear() }
            throw error
        }
    }

    func lock() { clear() }

    private func clear() {
        generation += 1
        session = nil
        snapshot = nil
        pins = [:]
    }

    func overview() async throws -> ChatOverview {
        guard let session else { throw ChatError.locked }
        let state = try await get(ChatSync.self, path: "sync")
        guard state.me.id == owner else { throw BackendError.accountChanged }
        guard state.me.pub == session.pub else { throw ChatError.identityChanged }
        let groups = state.groups
        var newPins: [String: ChatPin] = [:]
        for person in state.friends + groups.flatMap(\.members) where person.id != owner {
            if let pub = person.pub, pins[person.id] == nil, newPins[person.id] == nil {
                _ = try pub.agreementKey()
                newPins[person.id] = .single(pub.fingerprint)
            }
        }
        if !newPins.isEmpty {
            // Preserve other devices’ existing pins. A newer remote pin supersedes
            // anything this phone was about to accept on first contact.
            let existing = try await storedPins()
            let merged = newPins.merging(pins) { _, known in known }.merging(existing) { _, remote in remote }
            if merged != existing { try await savePins(merged) }
            pins = merged
        }
        snapshot = state
        let direct = state.friends.map { person in
            ChatThread(id: person.id, group: false, name: person.displayName, subtitle: "@\(person.handle)",
                       last: person.last.map { message($0, person: person, group: nil, session: session) },
                       unread: person.unread ?? 0, sendByPigeon: state.me.pigeons && person.way == "pigeon",
                       keyChanged: !trusted(person))
        }
        let groupThreads = groups.map { group in
            ChatThread(id: group.id, group: true, name: group.name, subtitle: "\(group.members.count) members",
                       last: group.last.map { message($0, person: nil, group: group, session: session) },
                       unread: group.unread, sendByPigeon: state.me.pigeons && group.way == "pigeon",
                       keyChanged: group.members.contains { $0.id != owner && !trusted($0) })
        }
        let threads = (direct + groupThreads).sorted {
            let first = $0.last?.wire.sentAt ?? 0
            let second = $1.last?.wire.sentAt ?? 0
            return first == second ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : first > second
        }
        return ChatOverview(threads: threads, friends: state.friends, incoming: state.incoming,
                            outgoing: state.outgoing, pigeons: state.me.pigeons)
    }

    func history(for thread: ChatThread) async throws -> [ChatMessage] {
        guard let session else { throw ChatError.locked }
        let (person, group) = try participants(thread)
        let data = try await get(ChatHistory.self, path: thread.group ? "group-messages" : "messages",
                                 query: [URLQueryItem(name: thread.group ? "id" : "with", value: thread.id)])
        let current = data.messages.filter { wire in
            guard let read = wire.readAt, let interval = wire.vanish else { return true }
            return read + interval > data.now
        }
        return current.map { message($0, person: person, group: group, session: session) }
    }

    func markRead(_ thread: ChatThread) async throws {
        let path = thread.group ? "group-read" : "read"
        let key = thread.group ? "id" : "with"
        let reply = try await post(ChatOK.self, path: path, body: [key: thread.id])
        guard reply.ok else { throw BackendError.invalidResponse }
    }

    func send(
        _ text: String, in thread: ChatThread, id: String, pigeon: String?,
        attachment: ChatDraftAttachment?, viewOnce: Bool
    ) async throws -> ChatMessage {
        guard let session else { throw ChatError.locked }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!trimmed.isEmpty || attachment != nil), trimmed.utf16.count <= 2_000 else { throw ChatError.invalidMessage }
        let (person, group) = try participants(thread)
        let sealed = try attachment.map { try ChatCrypto.sealMedia($0, id: id) }
        let once: Bool? = attachment.map { $0.file == nil && viewOnce }
        let payload = try ChatCrypto.padded(trimmed, media: sealed?.key)
        let request: ChatSendBody
        if let group {
            let bodyKey = ChatCrypto.randomKey()
            let encrypted = try ChatCrypto.sealGroup(payload, key: bodyKey, id: id, from: owner, group: group.id)
            let wrap = try JSONEncoder().encode(ChatWrap(k: bodyKey.base64EncodedString(), h: ChatCrypto.digest(encrypted)))
            var keys: [String: String] = [:]
            for member in group.members {
                let publicKey = member.id == owner ? session.pub : try checkedKey(member)
                keys[member.id] = try ChatCrypto.seal(wrap, from: session.privateKey, to: publicKey,
                                                     type: "wrap", id: id, sender: owner, recipient: member.id)
            }
            request = ChatSendBody(id: id, to: nil, ct: nil, group: group.id, body: encrypted, keys: keys,
                                   instant: pigeon == nil, pigeon: pigeon, once: once)
        } else {
            guard let person else { throw ChatError.unavailable }
            let ciphertext = try ChatCrypto.seal(payload, from: session.privateKey, to: checkedKey(person),
                                                 type: "msg", id: id, sender: owner, recipient: person.id)
            request = ChatSendBody(id: id, to: person.id, ct: ciphertext, group: nil, body: nil, keys: nil,
                                   instant: pigeon == nil, pigeon: pigeon, once: once)
        }
        let path = thread.group ? "group-messages" : "messages"
        do {
            let sent: ChatSendReply
            if let sealed {
                let boundary = "InfliteChat-\(UUID().uuidString)"
                var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n".utf8)
                body.append(try JSONEncoder().encode(request))
                body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"sealed.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n".utf8))
                body.append(sealed.data)
                body.append(Data("\r\n--\(boundary)--\r\n".utf8))
                sent = try await self.request(ChatSendReply.self, path: path, method: "POST", body: body,
                                              contentType: "multipart/form-data; boundary=\(boundary)")
            } else {
                sent = try await post(ChatSendReply.self, path: path, body: request)
            }
            return message(sent.message, person: person, group: group, session: session)
        } catch let conflict as BackendError {
            guard case .http(409, _) = conflict else { throw conflict }
            let latest = try? await history(for: thread)
            if let matching = latest?.first(where: { $0.id == id && $0.wire.from == owner }) { return matching }
            throw conflict
        }
    }

    func media(_ message: ChatMessage, in thread: ChatThread) async throws -> Data {
        guard let session, message.wire.photo == 1, let media = message.media else { throw ChatError.unavailable }
        let match = message.wire.id.range(of: "^[a-f0-9-]{36}$", options: .regularExpression) != nil
        guard match else { throw ChatError.invalidMessage }
        let path = thread.group ? "group-photo" : "photo"
        let data = try await backend.chatData(path: "\(path)/\(message.id)", owner: owner, bearer: session.token)
        guard self.session?.token == session.token, data.count <= 8 * 1024 * 1024 else { throw ChatError.unavailable }
        return try ChatCrypto.openMedia(data, key: media, id: message.id, voice: message.voice)
    }

    func requestFriend(_ handle: String) async throws -> String {
        struct FriendReply: Decodable { let message: String }
        let handle = handle.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "@")))
        guard !handle.isEmpty, handle.count <= 64 else { throw BackendError.invalidRequest }
        return try await post(FriendReply.self, path: "friends", body: ["handle": handle]).message
    }

    func respond(to friend: ChatPerson, accept: Bool) async throws {
        struct ResponseBody: Encodable {
            let id: String
            let accept: Bool
        }
        _ = try await post(ChatOK.self, path: "friends-respond", body: ResponseBody(id: friend.id, accept: accept))
    }

    func createGroup(name: String, friends: Set<String>) async throws -> String {
        struct GroupBody: Encodable {
            let name: String
            let members: [String]
        }
        struct GroupReply: Decodable {
            let group: ChatGroup
        }
        let result = try await post(GroupReply.self, path: "groups",
                                    body: GroupBody(name: name, members: friends.sorted()))
        return result.group.id
    }

    func safetyNumbers(for thread: ChatThread) throws -> [ChatSafetyNumber] {
        guard let session else { throw ChatError.locked }
        let (person, group) = try participants(thread)
        let people = group?.members ?? [person].compactMap { $0 }
        return people.compactMap { person in
            guard person.id != owner, let pub = person.pub else { return nil }
            let number = ChatCrypto.safetyNumber(owner: owner, ownKey: session.pub, peer: person.id, peerKey: pub)
            return ChatSafetyNumber(id: person.id, name: person.displayName, number: number,
                                    fingerprint: pub.fingerprint, changed: !trusted(person))
        }
    }

    func verify(_ number: ChatSafetyNumber, in thread: ChatThread) async throws {
        guard let latest = try safetyNumbers(for: thread).first(where: { $0.id == number.id }),
              latest.fingerprint == number.fingerprint else { throw ChatError.contactChanged }
        var remote = try await storedPins()
        if let old = remote[number.id]?.value, old != number.fingerprint {
            let history = "old:\(number.id)"
            let observed = remote[history]?.all ?? []
            remote[history] = .history(observed.contains(old) ? observed : observed + [old])
        }
        remote[number.id] = .single(number.fingerprint)
        remote["v:\(number.id)"] = .single(number.fingerprint)
        try await savePins(remote)
        pins = remote
    }

    private func participants(_ thread: ChatThread) throws -> (ChatPerson?, ChatGroup?) {
        if thread.group, let group = snapshot?.groups.first(where: { $0.id == thread.id }) { return (nil, group) }
        if !thread.group, let person = snapshot?.friends.first(where: { $0.id == thread.id }) { return (person, nil) }
        throw ChatError.unavailable
    }

    private func trusted(_ person: ChatPerson) -> Bool {
        guard let pub = person.pub else { return false }
        return pins[person.id]?.value == pub.fingerprint
    }

    private func checkedKey(_ person: ChatPerson) throws -> ChatPublicKey {
        guard let pub = person.pub, trusted(person) else { throw ChatError.contactChanged }
        return pub
    }

    private func acceptedKeys(for person: ChatPerson) -> [ChatPublicKey] {
        let values = (pins[person.id]?.all ?? []) + (pins["old:\(person.id)"]?.all ?? [])
        return values.compactMap(ChatPublicKey.init(fingerprint:))
    }

    private func message(_ wire: ChatWireMessage, person: ChatPerson?, group: ChatGroup?, session: Session) -> ChatMessage {
        var payload: ChatBody?
        if let group, let body = wire.body, let wrap = wire.key, wire.gid == group.id {
            let keys = wire.from == owner ? [session.pub] :
                group.members.first(where: { $0.id == wire.from }).map { acceptedKeys(for: $0) } ?? []
            for key in keys {
                if let opened = try? ChatCrypto.openGroup(body, wrap: wrap, with: session.privateKey, peer: key,
                                                          id: wire.id, from: wire.from, owner: owner, group: group.id) {
                    payload = opened
                    break
                }
            }
        } else if let person, let sealed = wire.ct, let to = wire.to,
                  (wire.from == owner && to == person.id) || (wire.from == person.id && to == owner) {
            for key in acceptedKeys(for: person) {
                if let opened = try? ChatCrypto.open(sealed, with: session.privateKey, peer: key,
                                                     type: wire.stopover == true ? "via" : "msg",
                                                     id: wire.id, sender: wire.from, recipient: to),
                   let decoded = try? JSONDecoder().decode(ChatBody.self, from: opened), decoded.r == nil, decoded.k == nil {
                    payload = decoded
                    break
                }
            }
        }
        let label: String
        if wire.recalled == true { label = "Pigeon called back" }
        else if wire.lost == true { label = "Pigeon lost" }
        else if wire.waiting == true { label = payload?.t ?? "Scheduled message" }
        else if wire.flying == true && payload == nil { label = "Pigeon in flight" }
        else if let text = payload?.t, !text.isEmpty { label = text }
        else if payload?.v != nil { label = "Voice message" }
        else if let attachment = payload?.p { label = attachment.f.map { ChatDraftAttachment.safeName($0.n) } ?? "Photo" }
        else { label = "Encrypted message unavailable" }
        return ChatMessage(wire: wire, text: label, media: payload?.p ?? payload?.v,
                           voice: payload?.v != nil, couldDecrypt: payload != nil)
    }

    private func storedPins() async throws -> [String: ChatPin] {
        guard let session else { throw ChatError.locked }
        let result = try await get(ChatStoredPins.self, path: "pins")
        guard let sealed = result.pins else { return [:] }
        let bytes = try ChatCrypto.open(sealed, with: session.privateKey, peer: session.pub,
                                        type: "pins", id: "pins", sender: owner, recipient: owner)
        return try JSONDecoder().decode(ChatPinEnvelope.self, from: bytes).pins
    }

    private func savePins(_ pins: [String: ChatPin]) async throws {
        guard let session else { throw ChatError.locked }
        let bytes = try JSONEncoder().encode(ChatPinEnvelope(pins: pins))
        let envelope = try ChatCrypto.seal(bytes, from: session.privateKey, to: session.pub,
                                           type: "pins", id: "pins", sender: owner, recipient: owner)
        let reply = try await post(ChatOK.self, path: "pins", body: ["pins": envelope])
        guard reply.ok else { throw BackendError.invalidResponse }
    }

    private func check(_ revision: Int) throws {
        try Task.checkCancellation()
        guard generation == revision else { throw ChatError.locked }
    }

    private func get<T: Decodable>(_ type: T.Type, path: String, query: [URLQueryItem] = []) async throws -> T {
        try await request(type, path: path, query: query)
    }

    private func post<T: Decodable, Body: Encodable>(_ type: T.Type, path: String, body: Body) async throws -> T {
        try await request(type, path: path, method: "POST", body: JSONEncoder().encode(body))
    }

    private func request<T: Decodable>(
        _ type: T.Type, path: String, method: String = "GET", query: [URLQueryItem] = [], body: Data? = nil,
        contentType: String = "application/json"
    ) async throws -> T {
        guard let session else { throw ChatError.locked }
        do {
            let data = try await backend.chatData(path: path, method: method, query: query, body: body, owner: owner,
                                                  bearer: session.token, contentType: contentType)
            guard self.session?.token == session.token else { throw ChatError.locked }
            return try JSONDecoder().decode(type, from: data)
        } catch let error as BackendError where error.isAuthenticationRequired {
            if self.session?.token == session.token { clear() }
            throw ChatError.locked
        }
    }
}

// Matches pigeon/crypto.js. CryptoKit keeps every private operation on the
// device and the service sees the same versioned, authenticated ciphertext.
enum ChatCrypto {
    private struct Envelope: Codable {
        let v: Int
        let s: String?
        let iv: String
        let d: String
    }

    private struct Handback: Codable {
        let v: Int
        let e: String
        let iv: String
        let d: String
    }

    private struct VaultKey: Decodable {
        struct JWK: Decodable {
            let kty: String
            let crv: String
            let d: String
        }

        let ecdh: JWK
    }

    static func randomKey() -> Data {
        SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
    }

    static func encodeURL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func decodeURL(_ string: String) -> Data? {
        let value = string.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let padding = String(repeating: "=", count: (4 - value.utf8.count % 4) % 4)
        return Data(base64Encoded: value + padding)
    }

    static func sealHandback(_ lock: Data, to recipient: P256.KeyAgreement.PublicKey) throws -> String {
        let ephemeral = P256.KeyAgreement.PrivateKey()
        let from = encodeURL(ephemeral.publicKey.x963Representation)
        let to = encodeURL(recipient.x963Representation)
        let key = try derived(ephemeral, recipient, salt: Data(repeating: 0, count: 32),
                              info: "inflight/handback/v1|\(from)|\(to)")
        let body = try JSONEncoder().encode(["lock": encodeURL(lock)])
        let box = try AES.GCM.seal(body, using: key, authenticating: Data("inflight/handback/v1".utf8))
        let envelope = Handback(v: 1, e: from, iv: encodeURL(Data(box.nonce)), d: encodeURL(box.ciphertext + box.tag))
        return try encoded(envelope)
    }

    static func openHandback(_ encoded: String, with recipient: P256.KeyAgreement.PrivateKey) throws -> Data {
        let envelope = try JSONDecoder().decode(Handback.self, from: Data(encoded.utf8))
        guard envelope.v == 1, let raw = decodeURL(envelope.e), let iv = decodeURL(envelope.iv),
              let data = decodeURL(envelope.d) else { throw ChatError.keyUnavailable }
        let from = try P256.KeyAgreement.PublicKey(x963Representation: raw)
        let to = encodeURL(recipient.publicKey.x963Representation)
        let key = try derived(recipient, from, salt: Data(repeating: 0, count: 32),
                              info: "inflight/handback/v1|\(envelope.e)|\(to)")
        let clear = try openAES(data, iv: iv, key: key, aad: "inflight/handback/v1")
        let payload = try JSONDecoder().decode([String: String].self, from: clear)
        guard let value = payload["lock"], let lock = decodeURL(value), lock.count == 32 else { throw ChatError.keyUnavailable }
        return lock
    }

    static func openVault(_ value: String, key: Data) throws -> P256.KeyAgreement.PrivateKey {
        let envelope = try JSONDecoder().decode(Envelope.self, from: Data(value.utf8))
        guard key.count == 32, envelope.v == 1, let iv = Data(base64Encoded: envelope.iv),
              let data = Data(base64Encoded: envelope.d) else { throw ChatError.keyUnavailable }
        let clear = try openAES(data, iv: iv, key: SymmetricKey(data: key), aad: "inflight/vault/v1")
        let payload = try JSONDecoder().decode(VaultKey.self, from: clear).ecdh
        guard payload.kty == "EC", payload.crv == "P-256",
              let raw = decodeURL(payload.d), raw.count == 32 else { throw ChatError.keyUnavailable }
        return try P256.KeyAgreement.PrivateKey(rawRepresentation: raw)
    }

    static func padded(_ text: String, media: ChatMediaKey? = nil) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let base = try encoder.encode(ChatMessageBody(t: text, p: media, z: ""))
        let bucket = [1_024, 4_096, 8_192].first(where: { $0 >= base.count }) ?? ((base.count + 4_095) / 4_096) * 4_096
        return try encoder.encode(ChatMessageBody(t: text, p: media, z: String(repeating: " ", count: bucket - base.count)))
    }

    static func seal(
        _ payload: Data, from privateKey: P256.KeyAgreement.PrivateKey, to publicKey: ChatPublicKey,
        type: String, id: String, sender: String, recipient: String
    ) throws -> String {
        let salt = Data(randomKey().prefix(16))
        let key = try derived(privateKey, publicKey.agreementKey(), salt: salt, info: "inflight/msg/v1")
        let context = "inflight/v2|\(type)|\(id)|\(sender)|\(recipient)"
        return try sealAES(payload, key: key, salt: salt, aad: context)
    }

    static func open(
        _ value: String, with privateKey: P256.KeyAgreement.PrivateKey, peer: ChatPublicKey,
        type: String, id: String, sender: String, recipient: String
    ) throws -> Data {
        let envelope = try JSONDecoder().decode(Envelope.self, from: Data(value.utf8))
        guard (1...2).contains(envelope.v), let salts = envelope.s, let salt = Data(base64Encoded: salts), salt.count == 16,
              let iv = Data(base64Encoded: envelope.iv), let data = Data(base64Encoded: envelope.d) else { throw ChatError.invalidMessage }
        let key = try derived(privateKey, peer.agreementKey(), salt: salt, info: "inflight/msg/v1")
        let context = envelope.v == 2 ? "inflight/v2|\(type)|" : "inflight/v1|"
        return try openAES(data, iv: iv, key: key, aad: context + "\(id)|\(sender)|\(recipient)")
    }

    static func sealGroup(_ payload: Data, key: Data, id: String, from: String, group: String) throws -> String {
        try sealAES(payload, key: SymmetricKey(data: key), salt: nil, aad: "inflight/group/v2|msg|\(id)|\(from)|\(group)")
    }

    static func openGroup(
        _ body: String, wrap: String, with privateKey: P256.KeyAgreement.PrivateKey, peer: ChatPublicKey,
        id: String, from: String, owner: String, group: String
    ) throws -> ChatBody {
        let keyData = try open(wrap, with: privateKey, peer: peer, type: "wrap", id: id, sender: from, recipient: owner)
        let key = try JSONDecoder().decode(ChatWrap.self, from: keyData)
        let envelope = try JSONDecoder().decode(Envelope.self, from: Data(body.utf8))
        guard (1...2).contains(envelope.v), let raw = Data(base64Encoded: key.k), raw.count == 32,
              let iv = Data(base64Encoded: envelope.iv), let data = Data(base64Encoded: envelope.d),
              key.h.map({ $0 == digest(body) }) ?? (envelope.v == 1) else { throw ChatError.invalidMessage }
        let prefix = envelope.v == 2 ? "inflight/group/v2|msg|" : "inflight/group/v1|"
        let plaintext = try openAES(data, iv: iv, key: SymmetricKey(data: raw), aad: prefix + "\(id)|\(from)|\(group)")
        let message = try JSONDecoder().decode(ChatBody.self, from: plaintext)
        guard message.r == nil, message.k == nil else { throw ChatError.invalidMessage }
        return message
    }

    static func openMedia(_ data: Data, key: ChatMediaKey, id: String, voice: Bool) throws -> Data {
        guard let raw = Data(base64Encoded: key.k), raw.count == 32, let iv = Data(base64Encoded: key.iv) else {
            throw ChatError.invalidMessage
        }
        let kind = voice ? "voice" : "photo"
        return try openAES(data, iv: iv, key: SymmetricKey(data: raw), aad: "inflight/\(kind)/v1|\(id)")
    }

    static func sealMedia(_ attachment: ChatDraftAttachment, id: String) throws -> (key: ChatMediaKey, data: Data) {
        let raw = randomKey()
        let box = try AES.GCM.seal(attachment.data, using: SymmetricKey(data: raw),
                                   authenticating: Data("inflight/photo/v1|\(id)".utf8))
        let key = ChatMediaKey(k: raw.base64EncodedString(), iv: Data(box.nonce).base64EncodedString(), f: attachment.file)
        return (key, box.ciphertext + box.tag)
    }

    static func digest(_ value: String) -> String {
        Data(SHA256.hash(data: Data(value.utf8))).base64EncodedString()
    }

    static func safetyNumber(owner: String, ownKey: ChatPublicKey, peer: String, peerKey: ChatPublicKey) -> String {
        let input = owner < peer ? "\(ownKey.fingerprint)|\(peerKey.fingerprint)" : "\(peerKey.fingerprint)|\(ownKey.fingerprint)"
        let bytes = Array(SHA512.hash(data: Data(input.utf8)))
        return (0..<12).map { index in
            let offset = index * 5
            let value = bytes[offset..<(offset + 5)].reduce(0) { partial, byte in partial * 256 + Int(byte) }
            return String(format: "%05d", value % 100_000)
        }.joined(separator: " ")
    }

    private static func derived(
        _ privateKey: P256.KeyAgreement.PrivateKey, _ publicKey: P256.KeyAgreement.PublicKey,
        salt: Data, info: String
    ) throws -> SymmetricKey {
        try privateKey.sharedSecretFromKeyAgreement(with: publicKey)
            .hkdfDerivedSymmetricKey(using: SHA256.self, salt: salt, sharedInfo: Data(info.utf8), outputByteCount: 32)
    }

    private static func sealAES(_ payload: Data, key: SymmetricKey, salt: Data?, aad: String) throws -> String {
        let box = try AES.GCM.seal(payload, using: key, authenticating: Data(aad.utf8))
        let envelope = Envelope(v: 2, s: salt?.base64EncodedString(), iv: Data(box.nonce).base64EncodedString(),
                                d: (box.ciphertext + box.tag).base64EncodedString())
        return try encoded(envelope)
    }

    private static func openAES(_ input: Data, iv: Data, key: SymmetricKey, aad: String) throws -> Data {
        guard iv.count == 12, input.count >= 16 else { throw ChatError.invalidMessage }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                       ciphertext: input.dropLast(16), tag: input.suffix(16))
        return try AES.GCM.open(box, using: key, authenticating: Data(aad.utf8))
    }

    private static func encoded<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }
}
