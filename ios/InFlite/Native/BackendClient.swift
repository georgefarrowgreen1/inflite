import Foundation
import Security

enum BackendOrigin: Sendable {
    case inFlite, mail

    var host: String {
        switch self {
        case .inFlite: "inflite.ai"
        case .mail: "email.inflite.ai"
        }
    }
}

enum BackendError: LocalizedError {
    case authenticationRequired
    case accountChanged
    case invalidRequest
    case invalidResponse
    case signInUnavailable
    case sessionStorage
    case http(status: Int, message: String?)

    var isAuthenticationRequired: Bool {
        switch self {
        case .authenticationRequired, .http(401, _): true
        default: false
        }
    }

    var errorDescription: String? {
        switch self {
        case .authenticationRequired: "Sign in to InFlite to continue."
        case .accountChanged: "Your account changed. Try again from your current session."
        case .invalidRequest: "This InFlite request is unavailable."
        case .invalidResponse: "InFlite returned an unexpected response. Try again."
        case .signInUnavailable: "Sign-in couldn’t open. Check your connection and try again."
        case .sessionStorage: "InFlite couldn’t access its secure session storage."
        case .http(_, let message): message ?? "InFlite couldn’t complete that request. Try again."
        }
    }
}

protocol BackendSessionStore: Sendable {
    func read() throws -> Data?
    func write(_ data: Data?) throws
}

struct BackendKeychainStore: BackendSessionStore {
    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "ai.inflite.ios",
            kSecAttrAccount as String: "native-session"
        ]
    }

    func read() throws -> Data? {
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw BackendError.sessionStorage }
        return data
    }

    func write(_ data: Data?) throws {
        guard let data else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw BackendError.sessionStorage }
            return
        }

        let values = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw BackendError.sessionStorage }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw BackendError.sessionStorage }
    }
}

// Only the first-party session credential persists. App responses remain in memory.
actor BackendClient {
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    static let shared = BackendClient()

    private struct Credential: Codable {
        let token: String
        let expires: Date
        let recentWriteUntil: Date

        var cookieHeader: String {
            "__Secure-account=\(token)" + (recentWriteUntil > .now ? "; ifl_rw=1" : "")
        }

        init?(response: HTTPURLResponse) {
            guard let url = response.url, let value = response.value(forHTTPHeaderField: "Set-Cookie") else { return nil }
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": value], for: url)
            let matched = cookies.filter { $0.name == "__Secure-account" }
            guard matched.count == 1, let cookie = matched.first,
                  [".inflite.ai", "inflite.ai"].contains(cookie.domain.lowercased()),
                  cookie.path == "/", cookie.isSecure, cookie.isHTTPOnly,
                  cookie.value.range(of: "^[A-Za-z0-9_-]{20,100}$", options: .regularExpression) != nil,
                  let expires = cookie.expiresDate, expires > .now else { return nil }
            self.token = cookie.value
            self.expires = expires
            // The API issues ifl_rw alongside the site cookie to pin recent writes to the primary.
            self.recentWriteUntil = Date().addingTimeInterval(60)
        }
    }

    private let store: any BackendSessionStore
    private let transport: Transport
    private var loaded = false
    private var credential: Credential?
    private var currentOwner: String?
    private var generation: UInt64 = 0
    private var transitioning = false

    init(store: any BackendSessionStore = BackendKeychainStore(), transport: Transport? = nil) {
        self.store = store
        if let transport {
            self.transport = transport
        } else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = false
            configuration.httpCookieStorage = nil
            configuration.urlCache = nil
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            configuration.timeoutIntervalForRequest = 30
            configuration.timeoutIntervalForResource = 45
            let session = URLSession(configuration: configuration, delegate: BackendNoRedirect(), delegateQueue: nil)
            self.transport = { request in
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else { throw BackendError.invalidResponse }
                return (data, http)
            }
        }
    }

    func session() async throws -> BackendSession {
        try prepareSessionRead()
        let (data, response) = try await fetch(path: "/api/session", credential: credential)
        let view = try decode(BackendSession.self, from: data)
        try apply(view, response: response)
        return view
    }

    func bootstrap() async throws -> BackendBootstrap {
        try prepareSessionRead()
        let (data, response) = try await fetch(path: "/api/boot", credential: credential)
        let result = try decode(BackendBootstrap.self, from: data)
        try apply(result.view, response: response)
        return result
    }

    func today(owner: String? = nil) async throws -> BackendToday {
        try await request(BackendToday.self, path: "/api/today", query: [URLQueryItem(name: "v", value: "2")], owner: owner)
    }

    func signIn(code: String, verifier: String) async throws -> BackendSession {
        guard !transitioning, currentOwner == nil else { throw BackendError.accountChanged }
        guard code.range(of: "^[A-Za-z0-9_-]{20,64}$", options: .regularExpression) != nil,
              verifier.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            throw BackendError.invalidRequest
        }
        transitioning = true
        generation &+= 1
        defer { transitioning = false }
        let body = try JSONEncoder().encode(["code": code, "verifier": verifier])
        let (data, response) = try await fetch(path: "/api/auth/handback", method: "POST", body: body)
        let view = try decode(BackendSession.self, from: data)
        guard view.signedIn, view.user != nil, Credential(response: response) != nil else {
            throw BackendError.invalidResponse
        }
        try apply(view, response: response)
        return view
    }

    func signOut() async throws {
        guard !transitioning else { throw BackendError.accountChanged }
        try restoreCredential()
        transitioning = true
        generation &+= 1
        defer { transitioning = false }
        if let credential {
            let (data, _) = try await fetch(path: "/api/logout", method: "POST", credential: credential)
            guard try decode(BackendLogoutBody.self, from: data).ok else { throw BackendError.invalidResponse }
        }
        try clearCredential()
    }

    func request<Response: Decodable>(
        _ response: Response.Type,
        path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        owner: String? = nil,
        origin: BackendOrigin = .inFlite
    ) async throws -> Response {
        let payload = try await data(path: path, method: method, query: query, body: body, owner: owner, origin: origin)
        return try decode(response, from: payload)
    }

    func data(
        path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        owner: String? = nil,
        origin: BackendOrigin = .inFlite
    ) async throws -> Data {
        try prepareSessionRead()
        guard let credential, let currentOwner else { throw BackendError.authenticationRequired }
        guard owner == nil || owner == currentOwner else { throw BackendError.accountChanged }
        let epoch = generation
        do {
            let (data, _) = try await fetch(
                path: path, method: method, query: query, body: body,
                credential: credential, owner: currentOwner, origin: origin
            )
            return data
        } catch BackendError.http(401, _) where path == "/api/today" && origin.host == "inflite.ai" {
            guard generation == epoch else { throw BackendError.accountChanged }
            // Today itself only returns 401 when the root InFlite session is gone.
            try clearCredential()
            throw BackendError.authenticationRequired
        }
    }

    private func prepareSessionRead() throws {
        guard !transitioning else { throw BackendError.accountChanged }
        try restoreCredential()
    }

    private func restoreCredential() throws {
        if !loaded {
            let data = try store.read()
            credential = data.flatMap { try? JSONDecoder().decode(Credential.self, from: $0) }
            loaded = true
            if data != nil && credential == nil { try store.write(nil) }
        }
        if let credential,
           credential.expires <= .now || credential.token.range(of: "^[A-Za-z0-9_-]{20,100}$", options: .regularExpression) == nil {
            try clearCredential()
        }
    }

    private func clearCredential() throws {
        if credential != nil || currentOwner != nil { generation &+= 1 }
        credential = nil
        currentOwner = nil
        loaded = true
        try store.write(nil)
    }

    private func apply(_ view: BackendSession, response: HTTPURLResponse) throws {
        if !view.signedIn {
            try clearCredential()
            return
        }
        guard let user = view.user, !user.id.isEmpty,
              let renewed = Credential(response: response) ?? credential else { throw BackendError.invalidResponse }
        if let currentOwner, currentOwner != user.id { throw BackendError.accountChanged }
        if credential?.token != renewed.token || credential?.expires != renewed.expires {
            try store.write(JSONEncoder().encode(renewed))
        }
        loaded = true
        credential = renewed
        currentOwner = user.id
    }

    private func fetch(
        path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        credential: Credential? = nil,
        owner: String? = nil,
        origin: BackendOrigin = .inFlite
    ) async throws -> (Data, HTTPURLResponse) {
        guard path.hasPrefix("/api/"), !path.contains("\\"),
              !path.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }) else {
            throw BackendError.invalidRequest
        }
        let epoch = generation
        var parts = URLComponents()
        parts.scheme = "https"
        parts.host = origin.host
        parts.path = path
        if !query.isEmpty { parts.queryItems = query }
        guard let url = parts.url else { throw BackendError.invalidRequest }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("https://\(origin.host)", forHTTPHeaderField: "Origin")
        request.setValue("1", forHTTPHeaderField: "X-Inflite")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let owner {
            request.setValue(owner, forHTTPHeaderField: "X-Inflite-Owner")
            if origin.host == "inflite.ai" && path.hasPrefix("/api/files/") {
                request.setValue(owner, forHTTPHeaderField: "X-Inflite-Files-Owner")
            }
        }
        if let credential { request.setValue(credential.cookieHeader, forHTTPHeaderField: "Cookie") }
        if method != "GET" && method != "HEAD" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body ?? Data("{}".utf8)
        }

        let (data, response) = try await transport(request)
        try Task.checkCancellation()
        guard generation == epoch else { throw BackendError.accountChanged }
        guard response.url == url else { throw BackendError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = try? JSONDecoder().decode(BackendErrorBody.self, from: data).error
            throw BackendError.http(status: response.statusCode, message: message.map { String($0.prefix(240)) })
        }
        return (data, response)
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do { return try JSONDecoder().decode(type, from: data) }
        catch { throw BackendError.invalidResponse }
    }
}

private struct BackendErrorBody: Decodable {
    let error: String
}

private struct BackendLogoutBody: Decodable {
    let ok: Bool
}

private final class BackendNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
