import Foundation

struct BackendSession: Codable, Sendable {
    let signedIn: Bool
    let user: BackendUser?
    let prefs: BackendTodayPreferences?
    let apps: [String: Bool]?
}

struct BackendUser: Codable, Sendable {
    let id: String
    let name: String
    let first: String?
    let handle: String?
    let appearance: String?
    let photoAt: Double?
}

struct BackendTodayPreferences: Codable, Sendable {
    let order: [String]?
    let hidden: [String]?
}

struct BackendBootstrap: Codable, Sendable {
    let view: BackendSession
    let cards: BackendToday?
}

struct BackendToday: Codable, Sendable {
    let at: Double?
    let tz: String?
    let phase: String?
    let cards: BackendTodayCards?
    let tops: [String: BackendTodayTop]?
    let upcoming: [BackendTodayEvent]?
    let waiting: [BackendTodayEvent]?
    let apps: [String: String]?
}

struct BackendTodayCards: Codable, Sendable {
    let weather: BackendWeatherCard?
}

struct BackendTodayTop: Codable, Sendable {
    let kind: String?
    let chip: String?
    let title: String?
    let lines: [String]?
    let stats: [BackendTodayStat]?
}

struct BackendTodayStat: Codable, Sendable {
    let label: String?
    let value: String?
    let tone: String?
}

struct BackendTodayEvent: Codable, Sendable {
    let id: String?
    let title: String?
    let sub: String?
    let app: String?
    let href: String?
    let first: String?
    let name: String?
    let at: Double?
}

struct BackendWeatherCard: Codable, Sendable {
    let state: String?
    let place: BackendWeatherPlace?
    let now: BackendWeatherNow?
    let day: BackendWeatherDay?
    let hours: BackendWeatherHours?
    let lead: String?
    let more: String?
    let href: String?
}

struct BackendWeatherPlace: Codable, Sendable {
    let name: String?
    let lat: Double?
    let lon: Double?
}

struct BackendWeatherNow: Codable, Sendable {
    let temp: String?
    let feels: String?
    let label: String?
    let icon: String?
    let isDay: Bool?
}

struct BackendWeatherDay: Codable, Sendable {
    let hi: String?
    let lo: String?
}

struct BackendWeatherHours: Codable, Sendable {
    let label: String?
    let list: [BackendWeatherHour]?
}

struct BackendWeatherHour: Codable, Sendable {
    let t: Double?
    let time: String?
    let temp: String?
    let icon: String?
    let label: String?
    let pop: Int?
}
