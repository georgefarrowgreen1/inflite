import XCTest
@testable import InFliteCore

final class NavigationTests: XCTestCase {
    func testDestinationsUseTrustedServices() throws {
        for destination in Destination.services + [.account] {
            XCTAssertTrue(NavigationPolicy.isInternal(try XCTUnwrap(destination.url)))
        }
        XCTAssertNil(Destination.chats.url, "Do not bypass the existing computer restriction")
    }
    func testSignInStaysInsideTheSharedSession() {
        for address in ["https://auth.inflite.ai/", "https://account.inflite.ai/#signin", "https://georgefarrowgreen.com/.well-known/webauthn"] {
            XCTAssertTrue(NavigationPolicy.isInternal(URL(string: address)!))
        }
    }
    func testLookalikesAndUnsafeSchemesStayOutside() {
        for address in ["https://inflite.ai.evil.test", "https://evilinflite.ai", "http://inflite.ai", "https://inflite.ai:8443", "https://user:password@inflite.ai", "file:///etc/passwd", "javascript:alert(1)"] {
            XCTAssertFalse(NavigationPolicy.isInternal(URL(string: address)!))
        }
        for address in ["file:///tmp/test", "javascript:alert(1)", "data:text/html,test", "inflite://account"] {
            XCTAssertFalse(NavigationPolicy.canOpenExternally(URL(string: address)!))
        }
        XCTAssertTrue(NavigationPolicy.canOpenExternally(URL(string: "https://example.com/")!))
        XCTAssertTrue(NavigationPolicy.canOpenExternally(URL(string: "mailto:hello@example.com")!))
    }
}
