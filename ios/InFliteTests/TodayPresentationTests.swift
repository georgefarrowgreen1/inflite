import Foundation
import XCTest
@testable import InFlite

final class TodayPresentationTests: XCTestCase {
    func testWarmLaunchShowsLastSuccessWithoutRestoringAuthenticatedAccess() async throws {
        let (cache, file) = makeCache()
        let session = PresentationSessionStore()
        let active = BackendClient(store: session, presentationCache: cache) { request in
            switch request.url?.path {
            case "/api/boot":
                return try TodayFixture.response(to: request, json: TodayFixture.bootstrap, issueCookie: true)
            case "/api/today":
                return try TodayFixture.response(to: request, json: #"{"tops":{"morning":{"title":"More recent summary"}}}"#)
            default:
                throw URLError(.unsupportedURL)
            }
        }
        _ = try await active.bootstrap()
        _ = try await active.today(owner: "example-owner")

        let disk = try String(contentsOf: file, encoding: .utf8)
        XCTAssertFalse(disk.contains(TodayFixture.token))
        XCTAssertFalse(disk.contains("Private conversation"))

        let relaunched = BackendClient(store: session, presentationCache: cache) { _ in
            throw URLError(.notConnectedToInternet)
        }
        let snapshot = try await relaunched.cachedTodayPresentation()
        XCTAssertEqual(snapshot?.owner, "example-owner")
        XCTAssertEqual(snapshot?.title, "More recent summary")

        do {
            _ = try await relaunched.today(owner: "example-owner")
            XCTFail("A cached summary must not establish an authenticated session.")
        } catch BackendError.authenticationRequired {
        }

        do {
            _ = try await relaunched.bootstrap()
            XCTFail("The network is unavailable in this test.")
        } catch let error as URLError {
            XCTAssertEqual(error.code, .notConnectedToInternet)
        }
        let afterFailure = try await relaunched.cachedTodayPresentation()
        XCTAssertEqual(afterFailure?.title, snapshot?.title)
    }

    func testSessionRefusalAndSignOutEraseCachedPresentation() async throws {
        for status in [200, 401, 403] {
            let (cache, file) = makeCache()
            let session = PresentationSessionStore()
            let client = BackendClient(store: session, presentationCache: cache) { request in
                switch request.url?.path {
                case "/api/boot":
                    return try TodayFixture.response(to: request, json: TodayFixture.bootstrap, issueCookie: true)
                case "/api/session":
                    return try TodayFixture.response(to: request, status: status, json: #"{"signedIn":false}"#)
                case "/api/logout":
                    return try TodayFixture.response(to: request, json: #"{"ok":true}"#)
                default:
                    throw URLError(.unsupportedURL)
                }
            }
            _ = try await client.bootstrap()
            let before = try await client.cachedTodayPresentation()
            XCTAssertNotNil(before)
            if status == 200 {
                try await client.signOut()
            } else {
                do {
                    _ = try await client.session()
                    XCTFail("Authentication was denied by the server.")
                } catch BackendError.authenticationRequired {
                    XCTAssertEqual(status, 401)
                } catch BackendError.http(403, _) {
                    XCTAssertEqual(status, 403)
                }
            }
            let after = try await client.cachedTodayPresentation()
            XCTAssertNil(after)
            if status == 403 {
                XCTAssertNotNil(session.read())
            } else {
                XCTAssertNil(session.read())
            }
            XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        }
    }

    func testCacheRejectsDifferentOwnerTokenAndExpiredSnapshot() throws {
        let (cache, file) = makeCache()
        let cards = try XCTUnwrap(JSONDecoder().decode(BackendBootstrap.self, from: Data(TodayFixture.bootstrap.utf8)).cards)
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let expiry = now.addingTimeInterval(30)
        let snapshot = try XCTUnwrap(TodayPresentationSnapshot(cards: cards, owner: "example-owner", expiresAt: expiry, now: now))

        cache.write(snapshot, token: TodayFixture.token)
        XCTAssertEqual(cache.read(token: TodayFixture.token, owner: "example-owner", now: now)?.title, "A saved day")
        XCTAssertEqual(cache.read(token: TodayFixture.token, owner: nil, now: now)?.expiresAt, expiry)
        XCTAssertFalse(try String(contentsOf: file, encoding: .utf8).contains("Private conversation"))

        XCTAssertNil(cache.read(token: TodayFixture.token, owner: "other-owner", now: now))
        cache.write(snapshot, token: TodayFixture.token)
        XCTAssertNil(cache.read(token: "another-token", owner: nil, now: now))
        cache.write(snapshot, token: TodayFixture.token)
        XCTAssertNil(cache.read(token: TodayFixture.token, owner: nil, now: expiry))
    }

    private func makeCache() -> (TodayPresentationCache, URL) {
        let directory = URL.applicationSupportDirectory.appending(path: "TodayCacheTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appending(path: "presentation.json", directoryHint: .notDirectory)
        return (TodayPresentationCache(file: file), file)
    }
}

private enum TodayFixture {
    static let token = "today-fixture-token-generated-for-test"
    static let bootstrap = """
    {
      "view": {"signedIn": true, "user": {"id": "example-owner", "name": "Example"}},
      "cards": {
        "phase": "morning",
        "tops": {"morning": {"title": "A saved day"}},
        "upcoming": [{"title": "Private conversation", "href": "/mail/"}]
      }
    }
    """

    static func response(to request: URLRequest, status: Int = 200, json: String, issueCookie: Bool = false) throws -> (Data, HTTPURLResponse) {
        let url = try XCTUnwrap(request.url)
        var headers = ["Content-Type": "application/json"]
        if issueCookie {
            headers["Set-Cookie"] = "__Secure-account=\(token); Domain=inflite.ai; Path=/; Secure; HttpOnly; Max-Age=3600"
        }
        let response = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers))
        return (Data(json.utf8), response)
    }
}

private final class PresentationSessionStore: BackendSessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Data?

    func read() -> Data? { lock.withLock { stored } }
    func write(_ data: Data?) { lock.withLock { stored = data } }
}
