import CryptoKit
import Foundation
import XCTest
@testable import InFlite

final class NavigationPolicyTests: XCTestCase {
    func testEveryRouteOpensTheCanonicalWebScreen() {
        let paths: [InFliteRoute: String] = [
            .today: "/", .weather: "/weather/", .markets: "/markets/",
            .fitness: "/fitness/", .mail: "/mail/", .chats: "/chats/",
            .calendar: "/calendar/", .notes: "/notes/", .people: "/people/",
            .status: "/status/", .account: "/settings/account/", .files: "/#files"
        ]
        XCTAssertEqual(Set(paths.keys), Set(InFliteRoute.allCases))
        for (route, path) in paths {
            XCTAssertEqual(route.url.absoluteString, "https://inflite.ai" + path)
            XCTAssertEqual(InFliteRoute(link: route.url), route)
            XCTAssertEqual(InFliteRoute(link: URL(string: "inflite://\(route.rawValue)")!), route)
        }
    }

    func testRejectsUnrecognizedOrParameterizedAppLinks() {
        for url in [
            "inflite://unknown", "inflite://weather:123", "inflite://weather/elsewhere",
            "inflite://weather?redirect=https://example.org", "inflite://name@weather",
            "inflite://weather#other", "https://example.org/weather/",
            "https://inflite.ai:8080/weather/", "https://inflite.ai/#signin",
            "https://inflite.ai/wildlife/"
        ] {
            XCTAssertNil(InFliteRoute(link: URL(string: url)!), url)
        }
    }

    func testCompanionSitesStayInTheWebSession() {
        for url in [
            "https://inflite.ai/weather/", "https://os.inflite.ai/",
            "https://auth.inflite.ai/go", "https://account.inflite.ai/",
            "https://email.inflite.ai/", "https://status.inflite.ai/",
            "https://chat.inflite.ai/", "https://weather.inflite.ai/",
            "https://fitness.inflite.ai/", "https://finance.inflite.ai/"
        ] {
            XCTAssertEqual(decision(url), .inside, url)
        }
    }

    func testUserLinksOpenExternallyAndRedirectsStayRestricted() {
        for url in ["https://example.org/", "mailto:hello@example.org", "tel:+441234567890"] {
            XCTAssertEqual(decision(url, tapped: true), .system, url)
            XCTAssertEqual(decision(url), .block, url)
            XCTAssertEqual(decision(url, tapped: true, trusted: false), .block, url)
        }
        for url in [
            "http://inflite.ai/", "https://inflite.ai.example.org/",
            "https://inflite.ai:8443/", "https://inflite.ai@example.org/",
            "https://other@inflite.ai/", "file:///private/", "javascript:alert(1)"
        ] {
            XCTAssertFalse(NavigationPolicy.owns(URL(string: url)!), url)
            XCTAssertEqual(decision(url), .block, url)
        }
        XCTAssertEqual(decision("https://inflite.ai:443/"), .inside)
    }

    func testFramesAndDownloadsRespectTheirNavigationBoundaries() {
        XCTAssertEqual(decision("about:srcdoc", mainFrame: false), .inside)
        XCTAssertEqual(decision("data:text/html,Message", mainFrame: false), .inside)
        XCTAssertEqual(decision("data:text/html,Message"), .block)
        XCTAssertEqual(decision("https://example.org/", mainFrame: false), .inside)
        XCTAssertTrue(NavigationPolicy.canDownload(URL(string: "blob:https://inflite.ai/file")!))
        XCTAssertTrue(NavigationPolicy.canDownload(URL(string: "https://email.inflite.ai/download")!))
        XCTAssertFalse(NavigationPolicy.canDownload(URL(string: "blob:https://example.org/file")!))
    }

    private func decision(
        _ url: String, mainFrame: Bool = true, tapped: Bool = false, trusted: Bool = true
    ) -> NavigationPolicy.Decision {
        NavigationPolicy.decide(
            URL(string: url)!, topLevel: mainFrame, userFollowedLink: tapped, trustedSource: trusted
        )
    }
}

final class BackendAuthenticationTests: XCTestCase {
    func testSignInBindsTheOneTimeCodeToAPrivateVerifier() throws {
        let challenge = try BackendHandback.start()
        let components = try XCTUnwrap(URLComponents(url: challenge.url, resolvingAgainstBaseURL: false))
        let items = try XCTUnwrap(components.queryItems)
        let digest = Data(SHA256.hash(data: Data(challenge.verifier.utf8)))
        let expected = digest.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        XCTAssertEqual(components.scheme, "https")
        XCTAssertEqual(components.host, "inflite.ai")
        XCTAssertEqual(components.path, "/auth/go")
        XCTAssertEqual(items.first { $0.name == "signin" }?.value, "today")
        XCTAssertEqual(items.first { $0.name == "back" }?.value, "https://inflite.ai/")
        XCTAssertEqual(items.first { $0.name == "ask" }?.value, expected)
        XCTAssertFalse(challenge.url.absoluteString.contains(challenge.verifier))
        XCTAssertEqual(challenge.verifier.count, 43)
        XCTAssertNotEqual(challenge.verifier, try BackendHandback.start().verifier)
    }

    func testAcceptsHandbackOnlyFromTheCanonicalReturnPage() throws {
        let code = "example_signin-code_12345678"
        let url = try XCTUnwrap(URL(string: "https://inflite.ai/#signin=" + code))
        XCTAssertEqual(BackendHandback.code(from: url), code)

        for invalid in [
            "http://inflite.ai/#signin=" + code,
            "https://inflite.ai.example.org/#signin=" + code,
            "https://auth.inflite.ai/#signin=" + code,
            "https://inflite.ai:8080/#signin=" + code,
            "https://user@inflite.ai/#signin=" + code,
            "https://inflite.ai/notes/#signin=" + code,
            "https://inflite.ai/?signin=" + code,
            "https://inflite.ai/#signin=too-short",
            "https://inflite.ai/#signin=" + String(repeating: "a", count: 65),
            "https://inflite.ai/#signin=" + code + "&signin=" + code
        ] {
            XCTAssertNil(BackendHandback.code(from: try XCTUnwrap(URL(string: invalid))), invalid)
        }
    }

    func testHandbackPersistsTheSessionAndSignOutErasesIt() async throws {
        let challenge = try BackendHandback.start()
        let code = "example_signin-code_12345678"
        let cookieValue = "example_account-token_12345678"
        let cookie = "__Secure-account=" + cookieValue
        let signedIn = #"{"signedIn":true,"user":{"id":"preview","name":"Preview"}}"#
        let store = MemoryBackendSessionStore()
        let transport: BackendClient.Transport = { request in
            let url = try XCTUnwrap(request.url)
            XCTAssertEqual(url.scheme, "https")
            XCTAssertEqual(url.host, "inflite.ai")
            let json: String
            var headers = ["Content-Type": "application/json"]
            switch url.path {
            case "/api/auth/handback":
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://inflite.ai")
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-Inflite"), "1")
                let data = try XCTUnwrap(request.httpBody)
                let body = try JSONDecoder().decode([String: String].self, from: data)
                XCTAssertEqual(body, ["code": code, "verifier": challenge.verifier])
                headers["Set-Cookie"] = cookie + "; Domain=inflite.ai; Path=/; Secure; HttpOnly; Max-Age=3600"
                json = signedIn
            case "/api/session":
                XCTAssertEqual(request.httpMethod, "GET")
                XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.contains(cookie) == true)
                json = signedIn
            case "/api/logout":
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")?.contains(cookie) == true)
                json = #"{"ok":true}"#
            default:
                XCTFail("Unexpected API request")
                throw URLError(.unsupportedURL)
            }
            let response = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers))
            return (Data(json.utf8), response)
        }

        let original = BackendClient(store: store, transport: transport)
        let signedInSession = try await original.signIn(code: code, verifier: challenge.verifier)
        XCTAssertEqual(signedInSession.user?.id, "preview")
        XCTAssertNotNil(store.read())

        let relaunched = BackendClient(store: store, transport: transport)
        let restoredSession = try await relaunched.session()
        XCTAssertEqual(restoredSession.user?.id, "preview")
        do {
            _ = try await relaunched.request([String: Bool].self, path: "/api/notes", owner: "different-preview")
            XCTFail("A view for a previous account must not use the current session.")
        } catch BackendError.accountChanged {
            // The request was rejected before transport.
        }
        try await relaunched.signOut()
        XCTAssertNil(store.read())
    }
}

final class BackendTodayTests: XCTestCase {
    func testDecodesProductionBootstrapShapeAndUnavailableCards() throws {
        let response = """
        {
          "view": {
            "signedIn": true,
            "user": { "id": "preview", "name": "Alex Morgan", "photoAt": null },
            "prefs": { "order": ["weather", "mail"], "hidden": [] }
          },
          "cards": {
            "phase": "morning",
            "at": 1793602800000,
            "cards": {
              "weather": {
                "state": "ok",
                "place": { "name": "London", "lat": 51.5, "lon": -0.13 },
                "now": { "temp": "9°", "label": "Partly Cloudy", "isDay": true }
              }
            },
            "tops": {
              "morning": {
                "title": "Your day, joined up",
                "lines": ["Rain from 15:00"],
                "stats": [{ "label": "Rain", "value": "15:00" }]
              }
            },
            "waiting": [],
            "upcoming": [{ "id": "rain", "title": "Rain reaches London", "app": "weather", "at": 1793631600000 }]
          }
        }
        """
        let boot = try JSONDecoder().decode(BackendBootstrap.self, from: Data(response.utf8))
        XCTAssertEqual(boot.view.user?.name, "Alex Morgan")
        XCTAssertEqual(boot.cards?.cards?.weather?.now?.temp, "9°")
        XCTAssertEqual(boot.cards?.tops?[boot.cards?.phase ?? ""]?.title, "Your day, joined up")
        XCTAssertEqual(boot.cards?.upcoming?.first?.id, "rain")

        let signedOut = #"{"view":{"signedIn":false},"cards":null}"#
        let empty = try JSONDecoder().decode(BackendBootstrap.self, from: Data(signedOut.utf8))
        XCTAssertFalse(empty.view.signedIn)
        XCTAssertNil(empty.cards)
    }
}

private final class MemoryBackendSessionStore: BackendSessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var data: Data?

    func read() -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return data
    }

    func write(_ data: Data?) {
        lock.lock()
        defer { lock.unlock() }
        self.data = data
    }
}
