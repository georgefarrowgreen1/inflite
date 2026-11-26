import CryptoKit
import Foundation
import XCTest
@testable import InFlite

final class ChatTests: XCTestCase {
    // These ciphertexts come from pigeon/crypto.js with generated test-only keys.
    func testOpensWebVaultAndDirectMessageAndRejectsReaddressing() throws {
        let vault = #"{"v":1,"iv":"uxNi9gPT8TnkO3Px","d":"1+7x5h8Nkrhg4Kr6xdIaoGlXdrTd8iN3zEqQBWB9nw/pHIXsMe1vDkU7LCm5irRIfqAyDu1hPE8U3UH4AkKwB4B8xosSVJTdZTrVLqt+XDQj6Y/MTnxV99NtFsd0X5kFrUcW7UFYR71lSL44kj79/kpjjQ31K9d89Th0VYTTCj1ikbXc+eqbHRzSE9c0Z7Gue0gUZHn0fQuLDx6oujhC9AQv6FqfTLaTkNDfytMgp5D/OVaYzuJPdZszSDFZ/eXtn1GtYbfhAlmR2DR2ftucaGjXWx236WjnwWzvjX+HUwA6EL0P"}"#
        let ciphertext = #"{"v":2,"s":"ZI/z1Y3KhtM1iEL9GQElBA==","iv":"quiMZx5kctsOhHZv","d":"+us/yO5vR2kCSNj2OnGHvtV2aI2fI/Y8nsUFBlP1xACbziGj1Yk/g9hPhw=="}"#
        let alice = try ChatCrypto.openVault(vault, key: Data((0..<32).map(UInt8.init)))
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
        let lock = Data((0..<32).map(UInt8.init))
        let sealed = try ChatCrypto.sealHandback(lock, to: transfer.publicKey)
        XCTAssertEqual(try ChatCrypto.openHandback(sealed, with: transfer), lock)
        XCTAssertThrowsError(try ChatCrypto.openHandback(sealed, with: other))
        XCTAssertEqual(try ChatCrypto.padded("A message 🔒 /").count, 1_024)
        XCTAssertEqual(try ChatCrypto.padded(String(repeating: "🔒", count: 800)).count, 4_096)
    }
}
