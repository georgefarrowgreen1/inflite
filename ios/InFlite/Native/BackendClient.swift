import Foundation
import Security

enum BackendOrigin: Sendable {
    case inFlite, mail, auth, account

    var host: String {
        switch self {
        case .inFlite: "inflite.ai"
        case .mail: "email.inflite.ai"
        case .auth: "auth.inflite.ai"
        case .account: "account.inflite.ai"
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

// The session credential stays in Keychain. Only the read-only Today launch
// summary is saved separately, bound to the current credential.
actor BackendClient {
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    static let shared = BackendClient(presentationCache: TodayPresentationCache())

    private struct Credential: Codable {
        let token: String
        let expires: Date
        var recentWriteUntil: Date

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
    private let presentationCache: TodayPresentationCache?
    private let transport: Transport
    private var loaded = false
    private var credential: Credential?
    private var currentOwner: String?
    private var generation: UInt64 = 0
    private var transitioning = false

    init(
        store: any BackendSessionStore = BackendKeychainStore(),
        presentationCache: TodayPresentationCache? = nil,
        transport: Transport? = nil
    ) {
        self.store = store
        self.presentationCache = presentationCache
        if let transport {
            self.transport = transport
        } else {
            func makeSession(requestTimeout: TimeInterval, resourceTimeout: TimeInterval) -> URLSession {
                let configuration = URLSessionConfiguration.ephemeral
                configuration.httpShouldSetCookies = false
                configuration.httpCookieStorage = nil
                configuration.urlCache = nil
                configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
                configuration.timeoutIntervalForRequest = requestTimeout
                configuration.timeoutIntervalForResource = resourceTimeout
                return URLSession(configuration: configuration, delegate: BackendNoRedirect(), delegateQueue: nil)
            }
            let session = makeSession(requestTimeout: 30, resourceTimeout: 45)
            let routeSession = makeSession(requestTimeout: 90, resourceTimeout: 95)
            self.transport = { request in
                let generatesRoute = request.url?.host == BackendOrigin.inFlite.host &&
                    request.url?.path == "/api/fitness/routes/generate"
                let (data, response) = try await (generatesRoute ? routeSession : session).data(for: request)
                guard let http = response as? HTTPURLResponse else { throw BackendError.invalidResponse }
                return (data, http)
            }
        }
    }

    func session() async throws -> BackendSession {
        try prepareSessionRead()
        let epoch = generation
        let (data, response) = try await fetchSession(path: "/api/session")
        try Task.checkCancellation()
        guard generation == epoch else { throw BackendError.accountChanged }
        let view = try decode(BackendSession.self, from: data)
        try apply(view, response: response)
        return view
    }

    func bootstrap() async throws -> BackendBootstrap {
        try prepareSessionRead()
        let epoch = generation
        let (data, response) = try await fetchSession(path: "/api/boot")
        try Task.checkCancellation()
        guard generation == epoch else { throw BackendError.accountChanged }
        let result = try decode(BackendBootstrap.self, from: data)
        try apply(result.view, response: response)
        if let cards = result.cards { rememberToday(cards) }
        return result
    }

    func cachedTodayPresentation() throws -> TodayPresentationSnapshot? {
        try prepareSessionRead()
        guard let credential else { return nil }
        return presentationCache?.read(token: credential.token, owner: currentOwner)
    }

    func today(owner: String? = nil) async throws -> BackendToday {
        let epoch = generation
        let cards = try await request(
            BackendToday.self, path: "/api/today", query: [URLQueryItem(name: "v", value: "2")], owner: owner
        )
        try Task.checkCancellation()
        guard generation == epoch else { throw BackendError.accountChanged }
        rememberToday(cards)
        return cards
    }

    private func rememberToday(_ cards: BackendToday) {
        guard let presentationCache, let currentOwner, let credential,
              let snapshot = TodayPresentationSnapshot(cards: cards, owner: currentOwner, expiresAt: credential.expires) else {
            return
        }
        presentationCache.write(snapshot, token: credential.token)
    }

    private func fetchSession(path: String) async throws -> (Data, HTTPURLResponse) {
        let epoch = generation
        do {
            return try await fetch(path: path, credential: credential)
        } catch BackendError.http(401, _) {
            guard generation == epoch else { throw BackendError.accountChanged }
            try clearCredential()
            throw BackendError.authenticationRequired
        } catch BackendError.http(403, let message) {
            guard generation == epoch else { throw BackendError.accountChanged }
            // A refusal can come from the edge rather than the account service.
            presentationCache?.clear()
            throw BackendError.http(status: 403, message: message)
        }
    }

    func signIn(code: String, verifier: String) async throws -> BackendSession {
        guard !transitioning, currentOwner == nil else { throw BackendError.accountChanged }
        let body = try handbackBody(code: code, verifier: verifier)
        transitioning = true
        generation &+= 1
        defer { transitioning = false }
        let (data, response) = try await fetch(path: "/api/auth/handback", method: "POST", body: body)
        let view = try decode(BackendSession.self, from: data)
        guard view.signedIn, view.user != nil, Credential(response: response) != nil else {
            throw BackendError.invalidResponse
        }
        try apply(view, response: response)
        return view
    }

    func reauthenticateMail(owner: String, code: String, verifier: String) async throws -> BackendSession {
        try prepareSessionRead()
        guard let credential, let currentOwner else { throw BackendError.authenticationRequired }
        guard currentOwner == owner else { throw BackendError.accountChanged }
        let body = try handbackBody(code: code, verifier: verifier)
        transitioning = true
        generation &+= 1
        defer { transitioning = false }
        let (data, response) = try await fetch(
            path: "/api/auth/handback", method: "POST", body: body,
            credential: credential, owner: owner, origin: .mail
        )
        let handback = try decode(BackendMailHandbackBody.self, from: data)
        guard let user = handback.user, user.id == owner else { throw BackendError.accountChanged }
        guard handback.access == "ok", Credential(response: response) != nil else {
            throw BackendError.http(status: 403, message: "Mail needs a fresh sign-in on an account with Mail access.")
        }
        let view = BackendSession(signedIn: true, user: user, prefs: nil, apps: nil)
        try apply(view, response: response)
        return view
    }

    private func handbackBody(code: String, verifier: String) throws -> Data {
        guard code.range(of: "^[A-Za-z0-9_-]{20,64}$", options: .regularExpression) != nil,
              verifier.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
            throw BackendError.invalidRequest
        }
        return try JSONEncoder().encode(["code": code, "verifier": verifier])
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
        origin: BackendOrigin = .inFlite,
        contentType: String = "application/json"
    ) async throws -> Response {
        let payload = try await data(
            path: path, method: method, query: query, body: body, owner: owner, origin: origin, contentType: contentType
        )
        return try decode(response, from: payload)
    }

    func data(
        path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: Data? = nil,
        owner: String? = nil,
        origin: BackendOrigin = .inFlite,
        contentType: String = "application/json"
    ) async throws -> Data {
        try prepareSessionRead()
        guard let credential, let currentOwner else { throw BackendError.authenticationRequired }
        guard owner == nil || owner == currentOwner else { throw BackendError.accountChanged }
        let epoch = generation
        do {
            let (data, response) = try await fetch(
                path: path, method: method, query: query, body: body,
                credential: credential, owner: currentOwner, origin: origin, contentType: contentType
            )
            if origin.host == BackendOrigin.account.host && path == "/api/account/reauth" && method == "POST",
               let url = response.url, let header = response.value(forHTTPHeaderField: "Set-Cookie"),
               HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: url).contains(where: {
                   $0.name == "ifl_rw" && $0.value == "1" && $0.isSecure && $0.path == "/"
               }) {
                self.credential?.recentWriteUntil = Date().addingTimeInterval(60)
            }
            return data
        } catch BackendError.http(401, _) where path == "/api/today" && origin.host == "inflite.ai" {
            guard generation == epoch else { throw BackendError.accountChanged }
            // Today itself only returns 401 when the root InFlite session is gone.
            try clearCredential()
            throw BackendError.authenticationRequired
        }
    }

    func chatData(
        path: String, method: String = "GET", query: [URLQueryItem] = [],
        body: Data? = nil, owner: String, bearer: String? = nil, contentType: String = "application/json"
    ) async throws -> Data {
        try prepareSessionRead()
        guard let credential, let currentOwner else { throw BackendError.authenticationRequired }
        guard owner == currentOwner else { throw BackendError.accountChanged }
        if path == "handback" {
            guard method == "POST", bearer == nil else { throw BackendError.invalidRequest }
            // With the source cookie, Chat keeps its site hash on the new bearer
            // row. Native sign-out then revokes both credentials in one operation.
            transitioning = true
            generation &+= 1
            defer { transitioning = false }
            let (payload, response) = try await fetch(
                path: "/api/pigeon/handback", method: method, body: body, credential: credential, owner: owner
            )
            if response.value(forHTTPHeaderField: "Set-Cookie")?.contains("__Secure-account=") == true {
                if let token = try? decode(BackendChatHandbackBody.self, from: payload).token,
                   token.range(of: "^[A-Za-z0-9_-]{20,100}$", options: .regularExpression) != nil {
                    _ = try? await fetch(path: "/api/pigeon/logout", method: "POST", bearer: token)
                }
                throw BackendError.accountChanged
            }
            return payload
        }
        guard bearer?.range(of: "^[A-Za-z0-9_-]{20,100}$", options: .regularExpression) != nil else {
            throw BackendError.invalidRequest
        }
        let (payload, _) = try await fetch(
            path: "/api/pigeon/\(path)", method: method, query: query, body: body, owner: owner,
            contentType: contentType, bearer: bearer
        )
        return payload
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
            if credential == nil {
                presentationCache?.clear()
                if data != nil { try store.write(nil) }
            }
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
        presentationCache?.clear()
        loaded = true
        try store.write(nil)
    }

    private func apply(_ view: BackendSession, response: HTTPURLResponse) throws {
        if !view.signedIn {
            try clearCredential()
            return
        }
        guard let user = view.user, !user.id.isEmpty,
              let renewed = Credential(response: response) ?? credential else {
            presentationCache?.clear()
            throw BackendError.invalidResponse
        }
        if let currentOwner, currentOwner != user.id {
            try clearCredential()
            throw BackendError.accountChanged
        }
        if credential?.token != renewed.token || credential?.expires != renewed.expires {
            presentationCache?.clear()
            try store.write(JSONEncoder().encode(renewed))
        } else if currentOwner == nil {
            _ = presentationCache?.read(token: renewed.token, owner: user.id)
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
        origin: BackendOrigin = .inFlite,
        contentType: String = "application/json",
        bearer: String? = nil
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
        let generatesRoute = origin.host == BackendOrigin.inFlite.host && path == "/api/fitness/routes/generate"
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: generatesRoute ? 90 : 30)
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
            if origin.host == "inflite.ai" && path.hasPrefix("/api/fitness/routes/") {
                request.setValue(owner, forHTTPHeaderField: "X-Inflite-Route-Owner")
            }
        }
        if let credential { request.setValue(credential.cookieHeader, forHTTPHeaderField: "Cookie") }
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if method != "GET" && method != "HEAD" {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
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

private struct BackendMailHandbackBody: Decodable {
    let access: String
    let user: BackendUser?
}

private struct BackendChatHandbackBody: Decodable {
    let token: String
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
