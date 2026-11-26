import Foundation

enum InFliteRoute: String, CaseIterable, Identifiable {
    case today, weather, markets, fitness, mail, chats, calendar, notes, people, status, account, files
    case notifications, reminders, about, privacy, support, storage, terms

    var id: String { rawValue }

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
        case .support:
            destination.path = "/contact/"
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
