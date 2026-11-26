import CryptoKit
import Foundation
import XCTest
@testable import InFlite

final class NavigationPolicyTests: XCTestCase {
    func testEveryRouteMatchesItsCanonicalAppLink() {
        let paths: [InFliteRoute: String] = [
            .today: "/", .weather: "/weather/", .markets: "/markets/",
            .fitness: "/fitness/", .mail: "/mail/", .chats: "/chats/",
            .calendar: "/calendar/", .notes: "/notes/", .people: "/people/",
            .status: "/status/", .account: "/settings/account/", .files: "/#files",
            .notifications: "/notifications/", .about: "/about/", .privacy: "/privacy/",
            .support: "/contact/", .storage: "/storage/", .terms: "/terms/"
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
            "https://inflite.ai/wildlife/", "https://inflite.ai/atlas/", "inflite://atlas"
        ] {
            XCTAssertNil(InFliteRoute(link: URL(string: url)!), url)
        }
    }

}

final class BackendAuthenticationTests: XCTestCase {
    func testSignInBindsTheOneTimeCodeToAPrivateVerifier() throws {
        let challenge = try BackendHandback.start()
        let digest = Data(SHA256.hash(data: Data(challenge.verifier.utf8)))
        let expected = digest.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        XCTAssertEqual(challenge.challenge, expected)
        XCTAssertNotEqual(challenge.challenge, challenge.verifier)
        XCTAssertEqual(challenge.verifier.count, 43)
        XCTAssertNotEqual(challenge.verifier, try BackendHandback.start().verifier)
    }

    func testPasswordDerivationMatchesTheWebClientsCurrentAndLegacyFormats() async throws {
        let password = "İnFlite Test １２３"
        let salt = "AAECAwQFBgcICQoLDA0ODw"
        let current = try await BackendPassword.derive(password, salt: "a2:" + salt)
        let legacy = try await BackendPassword.derive(password, salt: salt)

        // These vectors were derived by the production E2E.fromPassword implementation.
        XCTAssertEqual(current.proof, "1nW50xfhfAiMoc1n0RK6McdHprh_67CUUcjmmiJ7NUk")
        XCTAssertEqual(current.lockKey.base64EncodedString(), "7JSRoejlteZnkdZvVSmGtm39B94b1sp9eG8fscpAIjI=")
        XCTAssertEqual(legacy.proof, "Z0RZsc1sRuwvC5N9fAF7iRM26zuyvXaHxn4MF5x_r-8")
        XCTAssertEqual(legacy.lockKey.base64EncodedString(), "wYqvkYOTqr1Ufl1+O6R3nbLGwW88ECWs/tiUNjRkJoY=")
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
