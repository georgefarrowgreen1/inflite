import Foundation
import WebKit
import InFliteCore

enum TodayServiceError: LocalizedError {
    case signedOut, accountChanged, unavailable, invalidResponse, rejected(String)
    var errorDescription: String? {
        switch self {
        case .signedOut: return "Your sign-in has ended. Sign in again to see your day."
        case .accountChanged: return "Your account changed while this was loading. Refresh to continue."
        case .unavailable: return "Couldn’t reach InFlite. Check your connection and try again."
        case .invalidResponse: return "InFlite sent an unexpected response. Try again."
        case .rejected(let message): return message
        }
    }
}

// Never follow API redirects with account cookies, even to another trusted app host.
private final class NoAPIRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor
final class TodayService {
    private let store = WKWebsiteDataStore.default().httpCookieStore
    func request<T: Decodable>(_ endpoint: TodayEndpoint, method: String = "GET", body: JSONValue? = nil) async throws -> T {
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
        let request = APIRequest.make(endpoint, method: method, body: try body.map { try JSONEncoder().encode($0) }, cookies: cookies)
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
        let session = URLSession(configuration: config, delegate: NoAPIRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch is CancellationError { throw CancellationError() }
        catch { throw TodayServiceError.unavailable }
        guard let http = response as? HTTPURLResponse, http.url?.host == "inflite.ai", data.count <= 2_000_000 else {
            throw TodayServiceError.invalidResponse
        }
        if http.statusCode == 401 { throw TodayServiceError.signedOut }
        guard (200..<300).contains(http.statusCode) else {
            let decoded = try? JSONDecoder().decode(JSONValue.self, from: data)
            let message = decoded?["error"].text
            throw TodayServiceError.rejected(message.map { String($0.prefix(240)) } ?? "InFlite couldn’t complete that request. Try again.")
        }
        guard http.value(forHTTPHeaderField: "Content-Type")?.contains("application/json") == true else {
            throw TodayServiceError.invalidResponse
        }
        // A response started under one sign-in must never renew it over a newer web sign-in.
        let currentCookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
        func identity(_ values: [HTTPCookie]) -> Set<String> {
            Set(values.filter { APIRequest.permits($0, for: request.url!) && $0.name != "ifl_rw" }
                .map { "\($0.name)|\($0.domain)|\($0.path)|\($0.value)" })
        }
        guard identity(cookies) == identity(currentCookies) else { throw TodayServiceError.accountChanged }
        let headers = http.allHeaderFields.reduce(into: [String: String]()) { result, pair in
            if let name = pair.key as? String { result[name] = String(describing: pair.value) }
        }
        if let url = request.url {
            for cookie in HTTPCookie.cookies(withResponseHeaderFields: headers, for: url) where APIRequest.permits(cookie, for: url, now: .distantPast) {
                await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                    if cookie.expiresDate.map({ $0 <= Date() }) == true { store.delete(cookie) { c.resume() } }
                    else { store.setCookie(cookie) { c.resume() } }
                }
            }
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw TodayServiceError.invalidResponse }
    }
}
