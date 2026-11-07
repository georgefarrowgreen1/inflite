import Foundation

public enum TodayEndpoint: String, Sendable {
    case boot, cards, morning, preferences, notifications, logout
    public var path: String {
        switch self {
        case .boot: return "/api/boot?v=2&with=morning"
        case .cards: return "/api/today?v=2&with=morning"
        case .morning: return "/api/morning"
        case .preferences: return "/api/prefs"
        case .notifications: return "/api/notify"
        case .logout: return "/api/logout"
        }
    }
}

public enum APIRequest {
    public static let origin = "https://inflite.ai"
    public static func make(_ endpoint: TodayEndpoint, method: String = "GET", body: Data? = nil, cookies: [HTTPCookie] = []) -> URLRequest {
        let url = URL(string: origin + endpoint.path)!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 22)
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue("same-origin", forHTTPHeaderField: "Sec-Fetch-Site")
        request.setValue("1", forHTTPHeaderField: "X-Inflite")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let permitted = cookies.filter { permits($0, for: url) }
        if !permitted.isEmpty {
            request.setValue(HTTPCookie.requestHeaderFields(with: permitted)["Cookie"], forHTTPHeaderField: "Cookie")
        }
        return request
    }

    public static func permits(_ cookie: HTTPCookie, for url: URL, now: Date = Date()) -> Bool {
        guard url.scheme == "https", url.host == "inflite.ai", url.port == nil || url.port == 443,
              ["account", "__Secure-account", "ifl_rw"].contains(cookie.name),
              cookie.expiresDate.map({ $0 > now }) ?? true else { return false }
        let domain = cookie.domain.lowercased()
        guard domain == "inflite.ai" || domain == ".inflite.ai" else { return false }
        let path = cookie.path
        return url.path == path || (url.path.hasPrefix(path) && (path.hasSuffix("/") || url.path.dropFirst(path.count).first == "/"))
    }
}
