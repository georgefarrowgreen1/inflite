import CryptoKit
import Foundation
import XCTest
@testable import InFlite

final class ChatTests: XCTestCase {
    // These ciphertexts come from pigeon/crypto.js with generated test-only keys.
    func testOpensWebVaultAndDirectMessageAndRejectsReaddressing() throws {
        let vault = #"{"v":1,"iv":"0vEFlv+nEL6m6ifn","d":"NNeR5nQvJlDf698YkUuAQy20h1dhNwCWMAmZC+9sw2A0rwd+xzpKp2WgDaWsvj9M7pXCJB+jeIiTZ5rPLmMiX0TOVLvJXU15mwYMetD12r7VpIlaxYRB5EEQaPXp4EEeqvVJ1pQ9qQClS/XZptDXPvS3A+bHYvVzW1E1B9uST1ZaVu7neBaAH8HlspBZFrdNJUkrlmarUXm/htzQB0cVK1E/3Sfys6iZhRX5fDpSRnBQdhUjHQPnB0NjT27CsU4oznIBSMFS2iG5GF1WztghUKxwq0ZLuO90YEhKVF92X6eh7HoNTQBBeN9KdaF1"}"#
        let ciphertext = #"{"v":2,"s":"ZI/z1Y3KhtM1iEL9GQElBA==","iv":"quiMZx5kctsOhHZv","d":"+us/yO5vR2kCSNj2OnGHvtV2aI2fI/Y8nsUFBlP1xACbziGj1Yk/g9hPhw=="}"#
        let alice = try ChatCrypto.openVault(vault, key: Data((0..<32).map { UInt8($0) }))
        let bob = try XCTUnwrap(ChatPublicKey(fingerprint:
            "Iv-zuwz-x-bTofG62FEzx8a-jKTZtL17PnzRChktl5o.MYgm6HsgQFsrQdwuJgXGFXaIhKoGWQwZv6zeP9YxijQ"))
        let bytes = try ChatCrypto.open(ciphertext, with: alice, peer: bob, type: "msg",
                                        id: "m-one", sender: "alice", recipient: "bob")
        XCTAssertEqual(try JSONDecoder().decode(ChatBody.self, from: bytes).t, "Web → native 🔒")
        XCTAssertThrowsError(try ChatCrypto.open(ciphertext, with: alice, peer: bob, type: "react",
                                                 id: "m-one", sender: "alice", recipient: "bob"))
        XCTAssertThrowsError(try ChatCrypto.open(ciphertext, with: alice, peer: bob, type: "msg",
                                                 id: "m-one", sender: "bob", recipient: "alice"))
    }

    func testOpensWebGroupMessageAndAuthenticatesItsBody() throws {
        let alice = try XCTUnwrap(ChatPublicKey(fingerprint:
            "KgqI-jVHj2h-18wElc9fnOq0G9chR-PsDAzveJjXRTI.yAUuOGhLL6zeEUgQDzhW0W33BfPWw2CcBzh-8B7v6NI"))
        let bob = try P256.KeyAgreement.PrivateKey(rawRepresentation:
            XCTUnwrap(ChatCrypto.decodeURL("Yb2yTmDTlHhTGCpjhciYhvduGRQM1PcdOIW6xbI5zbE")))
        let body = #"{"v":2,"iv":"zuuAyT8rRO5ML5WX","d":"5lwqcZVkDmuIFaK4wJPwI9BB+G9wCBG15pmbHSbVW3ITmHaRFrlVnGVqyw=="}"#
        let wrap = #"{"v":2,"s":"S/ENLKcX/C64sogw8UaYng==","iv":"i7+yQM8tFm0fItQ8","d":"7ho+EGZq5L9WoTzsXzv9+2VykcI2gCM0PbbZkQm0rJySwaYUnBFXcDquY/amrOCuOIPKs5TT8famfGkiMT85rPMAK10rRTsOLGcj3mHNtd4wWAWGkSHLif+nbuCDGReO7txDGb3w0MAsH5/RT3Za+wziLsK4c9c="}"#
        let payload = try ChatCrypto.openGroup(body, wrap: wrap, with: bob, peer: alice, id: "m-one",
                                               from: "alice", owner: "bob", group: "team")
        XCTAssertEqual(payload.t, "Web → native 🔒")
        XCTAssertThrowsError(try ChatCrypto.openGroup(body + " ", wrap: wrap, with: bob, peer: alice,
                                                       id: "m-one", from: "alice", owner: "bob", group: "team"))
    }

    func testHandbackBindsLockToItsRecipientAndMessagesUseWebPadding() throws {
        let transfer = P256.KeyAgreement.PrivateKey()
        let other = P256.KeyAgreement.PrivateKey()
        let lock = Data((0..<32).map { UInt8($0) })
        let sealed = try ChatCrypto.sealHandback(lock, to: transfer.publicKey)
        XCTAssertEqual(try ChatCrypto.openHandback(sealed, with: transfer), lock)
        XCTAssertThrowsError(try ChatCrypto.openHandback(sealed, with: other))
        XCTAssertEqual(try ChatCrypto.padded("A message 🔒 /").count, 1_024)
        XCTAssertEqual(try ChatCrypto.padded(String(repeating: "🔒", count: 800)).count, 4_096)
    }

    func testAttachmentCiphertextIsBoundToTheMessage() throws {
        let bytes = Data("Confidential attachment".utf8)
        let attachment = try ChatDraftAttachment(data: bytes, name: "../brief.txt", mediaType: "text/plain")
        let sealed = try ChatCrypto.sealMedia(attachment, id: "photo-id")
        XCTAssertEqual(sealed.key.f?.n, ".._brief.txt")
        XCTAssertNotEqual(sealed.data, bytes)
        XCTAssertEqual(try ChatCrypto.openMedia(sealed.data, key: sealed.key, id: "photo-id", voice: false), bytes)
        XCTAssertThrowsError(try ChatCrypto.openMedia(sealed.data, key: sealed.key, id: "another-id", voice: false))
    }

    func testChatHandbackUsesTheNativeSessionAndSubsequentRequestsUseOnlyChatBearer() async throws {
        let cookie = "__Secure-account=native-account-token_1234567890"
        let bearer = "native-chat-token_1234567890"
        let backend = BackendClient(store: ChatTestSessionStore()) { request in
            let url = try XCTUnwrap(request.url)
            let json: String
            var headers = ["Content-Type": "application/json"]
            switch url.path {
            case "/api/auth/handback":
                json = #"{"signedIn":true,"user":{"id":"chat-test","name":"Chat Test"}}"#
                headers["Set-Cookie"] = cookie + "; Domain=inflite.ai; Path=/; Secure; HttpOnly; Max-Age=3600"
            case "/api/pigeon/handback":
                XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.contains(cookie) == true)
                XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
                json = #"{"token":"\#(bearer)"}"#
            case "/api/pigeon/sync":
                XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(bearer)")
                json = "{}"
            case "/api/logout":
                XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.contains(cookie) == true)
                json = #"{"ok":true}"#
            default:
                throw URLError(.unsupportedURL)
            }
            let response = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers))
            return (Data(json.utf8), response)
        }
        let handback = try BackendHandback.start()
        _ = try await backend.signIn(code: "chat-sign-in-code_abcdefghijklmn", verifier: handback.verifier)
        _ = try await backend.chatData(path: "handback", method: "POST", owner: "chat-test")
        _ = try await backend.chatData(path: "sync", owner: "chat-test", bearer: bearer)
        try await backend.signOut()
        do {
            _ = try await backend.chatData(path: "sync", owner: "chat-test", bearer: bearer)
            XCTFail("Chat must require an active native account.")
        } catch BackendError.authenticationRequired {
        }
    }
}

private final class ChatTestSessionStore: BackendSessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Data?

    func read() -> Data? { lock.withLock { stored } }
    func write(_ data: Data?) { lock.withLock { stored = data } }
}
