import Foundation

public enum Destination: String, CaseIterable, Identifiable, Codable {
    case apps, you, today, mail, chats, weather, fitness, markets, account

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .apps: return "Apps"
        case .you: return "You"
        case .today: return "Today"
        case .mail: return "Mail"
        case .chats: return "Chats"
        case .weather: return "Weather"
        case .fitness: return "Fitness"
        case .markets: return "Markets"
        case .account: return "Your account"
        }
    }
    public var symbol: String {
        switch self {
        case .apps: return "square.grid.2x2"
        case .you: return "person.crop.circle"
        case .today: return "sun.max.fill"
        case .mail: return "envelope.fill"
        case .chats: return "bubble.left.and.bubble.right.fill"
        case .weather: return "cloud.sun.fill"
        case .fitness: return "figure.outdoor.cycle"
        case .markets: return "chart.line.uptrend.xyaxis"
        case .account: return "person.crop.circle"
        }
    }
    public var subtitle: String {
        switch self {
        case .apps: return "Your InFlite apps"
        case .you: return "Your InFlite preferences"
        case .today: return "A clear view of your day"
        case .mail: return "Make room for what matters"
        case .chats: return "Available on iPhone and iPad"
        case .weather: return "Know what’s ahead"
        case .fitness: return "Find your next good ride"
        case .markets: return "Keep your world in view"
        case .account: return "Sign-in and preferences"
        }
    }
    public var url: URL? {
        let address: String
        switch self {
        case .apps: address = "https://inflite.ai/#apps"
        case .you: address = "https://inflite.ai/#you"
        case .chats: address = "https://inflite.ai/chats/"
        case .today: address = "https://inflite.ai/"
        case .mail: address = "https://inflite.ai/mail/"
        case .weather: address = "https://inflite.ai/weather/"
        case .fitness: address = "https://inflite.ai/fitness/"
        case .markets: address = "https://inflite.ai/markets/"
        case .account: address = "https://account.inflite.ai/"
        }
        return URL(string: address)
    }
    public static let services: [Self] = [.today, .mail, .weather, .fitness, .markets]
}

public enum NavigationPolicy {
    public static let trustedHosts: Set<String> = [
        "inflite.ai", "email.inflite.ai", "account.inflite.ai", "auth.inflite.ai",
        "chat.inflite.ai", "weather.inflite.ai", "fitness.inflite.ai", "finance.inflite.ai",
        "georgefarrowgreen.com", "account.georgefarrowgreen.com"
    ]

    public static func isInternal(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && (url.port == nil || url.port == 443) &&
        url.user == nil && url.password == nil && trustedHosts.contains(url.host?.lowercased() ?? "")
    }

    public static func canOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "mailto" { return true }
        return ["https", "http"].contains(scheme) && url.host != nil && url.user == nil && url.password == nil
    }
}
