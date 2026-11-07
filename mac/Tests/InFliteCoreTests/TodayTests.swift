import XCTest
@testable import InFliteCore

final class TodayTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")))
    }
    func testExistingBackendResponseDecodesWithoutReinterpretingItsWords() throws {
        let boot = try JSONDecoder().decode(TodayBoot.self, from: fixture("boot"))
        XCTAssertTrue(boot.view.signedIn)
        XCTAssertEqual(boot.view.user?.first, "Alex")
        XCTAssertEqual(boot.cards?.cards["weather"]?["now"]["temp"].text, "9°")
        XCTAssertEqual(boot.cards?.cards["fitness"]?["session"]["name"].text, "Endurance 75")
        XCTAssertEqual(boot.cards?.morning?.at, 420)
        XCTAssertFalse(boot.cards?.upcoming?.isEmpty ?? true)
    }
    func testSignedOutHasNoManufacturedProfileOrCards() throws {
        let boot = try JSONDecoder().decode(TodayBoot.self, from: fixture("signed-out"))
        XCTAssertFalse(boot.view.signedIn)
        XCTAssertNil(boot.view.user)
        XCTAssertNil(boot.cards)
    }
    func testCardOrderRespectsHiddenCardsAndRejectsUnknownOrDuplicateKinds() {
        let prefs = CardPreferences(order: ["markets", "weather", "unknown", "markets"], hidden: ["chat"])
        XCTAssertEqual(CardKind.ordered(prefs), [.markets, .weather, .fitness])
    }
    func testNativeScreensAreExplicit() {
        XCTAssertTrue(Destination.today.isNative)
        XCTAssertTrue(Destination.apps.isNative)
        XCTAssertTrue(Destination.you.isNative)
        XCTAssertFalse(Destination.weather.isNative)
        XCTAssertFalse(Destination.webToday.isNative)
    }
    func testRequestsUseTheExistingOriginContractAndDisableCookieCaching() throws {
        let body = Data(#"{"hidden":["chat"]}"#.utf8)
        let request = APIRequest.make(.preferences, method: "PUT", body: body)
        XCTAssertEqual(request.url?.absoluteString, "https://inflite.ai/api/prefs")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://inflite.ai")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Inflite"), "1")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Sec-Fetch-Site"), "same-origin")
        XCTAssertFalse(request.httpShouldHandleCookies)
        XCTAssertEqual(request.httpBody, body)
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    }
    private func cookie(_ name: String, domain: String, path: String = "/", expires: Date? = nil) -> HTTPCookie {
        var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: "test-session-value-123456789", .domain: domain, .path: path, .secure: "TRUE"]
        if let expires { properties[.expires] = expires }
        return HTTPCookie(properties: properties)!
    }
    func testOnlyApplicableAccountCookiesAreForwarded() {
        let cookies = [cookie("__Secure-account", domain: ".inflite.ai"), cookie("analytics", domain: ".inflite.ai"),
                       cookie("account", domain: ".evilinflite.ai"), cookie("account", domain: "account.inflite.ai"),
                       cookie("account", domain: ".inflite.ai", path: "/api/private"),
                       cookie("account", domain: ".inflite.ai", expires: Date(timeIntervalSince1970: 0))]
        let header = APIRequest.make(.boot, cookies: cookies).value(forHTTPHeaderField: "Cookie") ?? ""
        XCTAssertTrue(header.hasPrefix("__Secure-account="))
        XCTAssertFalse(header.contains("analytics"))
        XCTAssertEqual(header.components(separatedBy: "=").count, 2, "Only the one applicable cookie")
        XCTAssertFalse(APIRequest.permits(cookies[0], for: URL(string: "https://example.com/api/boot")!))
        XCTAssertFalse(APIRequest.permits(cookies[0], for: URL(string: "http://inflite.ai/api/boot")!))
    }
}
