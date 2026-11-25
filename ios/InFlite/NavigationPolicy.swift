import Foundation

enum InFliteRoute: String, CaseIterable {
    case today, weather, markets, fitness, mail, chats, calendar, notes, people, status, account, files

    static let origin = URL(string: "https://inflite.ai")!

    var url: URL {
        var destination = URLComponents(url: Self.origin, resolvingAgainstBaseURL: false)!
        switch self {
        case .today:
            destination.path = "/"
        case .files:
            destination.path = "/"
            destination.fragment = "files"
        case .account:
            destination.path = "/settings/account/"
        default:
            destination.path = "/\(rawValue)/"
        }
        return destination.url!
    }

    init?(link: URL) {
        guard let components = URLComponents(url: link, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              components.query == nil else { return nil }

        if components.scheme?.lowercased() == "inflite" {
            guard let host = components.host?.lowercased(), components.port == nil,
                  components.fragment == nil,
                  ["", "/"].contains(components.percentEncodedPath),
                  let route = Self(rawValue: host) else { return nil }
            self = route
            return
        }

        guard components.scheme?.lowercased() == "https",
              components.host?.lowercased() == Self.origin.host,
              components.port == nil || components.port == 443,
              let route = Self.allCases.first(where: {
                  $0.url.path == link.path && $0.url.fragment == components.fragment
              }) else { return nil }
        self = route
    }
}

enum NavigationPolicy {
    enum Decision: Equatable {
        case inside, system, block
    }

    private static let hosts: Set<String> = [
        "inflite.ai", "os.inflite.ai", "auth.inflite.ai", "account.inflite.ai",
        "email.inflite.ai", "status.inflite.ai", "chat.inflite.ai",
        "weather.inflite.ai", "fitness.inflite.ai", "finance.inflite.ai"
    ]

    static func owns(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil else { return false }
        return owns(scheme: components.scheme ?? "", host: components.host ?? "", port: components.port)
    }

    static func owns(scheme: String, host: String, port: Int?) -> Bool {
        scheme.lowercased() == "https" && hosts.contains(host.lowercased()) && (port == nil || port == 443)
    }

    static func canDownload(_ url: URL) -> Bool {
        if owns(url) { return true }
        guard url.scheme?.lowercased() == "blob",
              let origin = URL(string: String(url.absoluteString.dropFirst("blob:".count))) else { return false }
        return owns(origin)
    }

    static func decide(
        _ destination: URL,
        topLevel: Bool,
        userFollowedLink: Bool,
        trustedSource: Bool
    ) -> Decision {
        let scheme = destination.scheme?.lowercased() ?? ""
        if owns(destination) { return .inside }

        if !topLevel && ["https", "about", "blob", "data"].contains(scheme) {
            // WebKit applies the page's CSP and the existing Mail frame sandbox.
            return .inside
        }

        guard userFollowedLink && trustedSource else { return .block }
        if ["mailto", "tel", "sms"].contains(scheme) { return .system }
        if ["http", "https"].contains(scheme),
           let parts = URLComponents(url: destination, resolvingAgainstBaseURL: false),
           parts.host?.isEmpty == false, parts.user == nil, parts.password == nil {
            return .system
        }
        return .block
    }
}
