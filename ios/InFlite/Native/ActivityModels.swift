import Foundation
import Observation

@MainActor
@Observable
final class ActivityResource<Value> {
    private(set) var value: Value?
    private(set) var issue: String?
    private(set) var loading = false
    private var generation = 0

    func load(_ fetch: () async throws -> Value) async {
        guard !Task.isCancelled else { return }
        generation &+= 1
        let current = generation
        loading = true
        issue = nil
        defer { if generation == current { loading = false } }
        do {
            let updated = try await fetch()
            try Task.checkCancellation()
            if generation == current { value = updated }
        } catch {
            guard generation == current, !Task.isCancelled else { return }
            if let backend = error as? BackendError {
                switch backend {
                case .accountChanged: value = nil
                default: if backend.isAuthenticationRequired { value = nil }
                }
            }
            if case .sessionChanged? = error as? ActivityAccountError { value = nil }
            issue = (error as? LocalizedError)?.errorDescription ?? "InFlite couldn’t load this information. Try again."
        }
    }
}

enum ActivityAccountError: LocalizedError {
    case sessionChanged, incompleteResponse

    var errorDescription: String? {
        switch self {
        case .sessionChanged: "Sign in to InFlite again to refresh this page."
        case .incompleteResponse: "InFlite sent an incomplete response. Try again."
        }
    }
}

struct ActivityMarketSnapshot: Decodable, Sendable {
    let signedIn: Bool
    let id: String?
    let holdings: [ActivityHolding]?
    let cash: [ActivityCash]?
    let quotes: [String: ActivityQuote]?
    let rates: [String: Double]?
    let indices: [String]?
    let at: Double?

    var positions: [ActivityHolding] { holdings ?? [] }
    var balances: [ActivityCash] { cash ?? [] }
    var benchmarks: [String] { indices ?? [] }
    var asOf: Date? { at.map { Date(timeIntervalSince1970: $0 / 1000) } }

    var newsSymbols: [String] {
        var seen = Set<String>()
        let ordered = positions.map(\.symbol) + benchmarks
        return Array(ordered.filter { seen.insert($0).inserted }.prefix(10))
    }

    func value(of position: ActivityHolding) -> Double? {
        guard let quote = quotes?[position.symbol], let price = quote.price,
              let rate = rates?[quote.cur], price.isFinite, rate > 0 else { return nil }
        return position.qty * price * rate
    }

    func validated(for owner: String) throws -> Self {
        guard signedIn, id == owner else { throw ActivityAccountError.sessionChanged }
        guard holdings != nil, quotes != nil else { throw ActivityAccountError.incompleteResponse }
        return self
    }
}

struct ActivityHolding: Decodable, Identifiable, Sendable {
    let symbol: String
    let name: String
    let qty: Double
    var id: String { symbol }
}

struct ActivityCash: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let amount: Double
    let rate: Double?
}

struct ActivityQuote: Decodable, Sendable {
    let name: String
    let cur: String
    let type: String
    let price: Double?
    let chgPct: Double?
    let time: Double?

    var pricedAt: Date? { time.map { Date(timeIntervalSince1970: $0) } }

    var priceLabel: String? {
        guard let price else { return nil }
        if type == "INDEX" || cur.isEmpty {
            return price.formatted(.number.precision(.fractionLength(0...2)))
        }
        if cur == "GBP", abs(price) < 1 {
            return (price * 100).formatted(.number.precision(.fractionLength(0...2))) + "p"
        }
        return price.formatted(.currency(code: cur).precision(.fractionLength(2...(abs(price) < 1 ? 4 : 2))))
    }
}

struct ActivityMarketChart: Decodable, Sendable {
    let t: [Double]
    let c: [Double]
    let cur: String

    struct Point: Identifiable {
        let date: Date
        let price: Double
        var id: Date { date }
    }

    var points: [Point] {
        var seen = Set<Double>()
        return zip(t, c).compactMap { time, price in
            guard time.isFinite, price.isFinite, seen.insert(time).inserted else { return nil }
            return Point(date: Date(timeIntervalSince1970: time), price: price)
        }
    }
}

struct ActivityMarketNews: Decodable, Sendable {
    let news: [Item]

    struct Item: Decodable, Identifiable, Sendable {
        let title: String
        let src: String
        let link: String
        let at: Double
        var id: String { link }
        var date: Date { Date(timeIntervalSince1970: at / 1000) }
        var articleURL: URL? {
            guard let url = URL(string: link), url.scheme == "https",
                  url.host != nil, url.user == nil, url.password == nil else { return nil }
            return url
        }
    }
}

struct ActivityFitnessSnapshot: Decodable, Sendable {
    let signedIn: Bool
    let id: String?
    let data: Settings?
    let acts: [ActivityWorkout]?
    let more: Bool?
    let times: [ActivityScheduledRide]?

    struct Settings: Decodable, Sendable {
        let prefs: Preferences?
        let profile: Profile?
        let plan: Plan?
    }

    struct Preferences: Decodable, Sendable { let units: String? }
    struct Profile: Decodable, Sendable { let ftp: Double? }

    struct Plan: Decodable, Sendable {
        let id: String
        let start: Double

        var date: Date { Date(timeIntervalSince1970: start / 1000) }
        var name: String {
            switch id {
            case "sportive": "Sportive 160 km"
            case "ftp": "FTP builder"
            case "base": "Winter base"
            case "10k": "First 10k"
            case "tri": "Sprint triathlon"
            default: "Training plan"
            }
        }
    }

    var distanceUnit: UnitLength {
        if let units = data?.prefs?.units { return units == "imperial" ? .miles : .kilometers }
        return Locale.current.measurementSystem == .us ? .miles : .kilometers
    }

    func validated(for owner: String) throws -> Self {
        guard signedIn, id == owner else { throw ActivityAccountError.sessionChanged }
        guard acts != nil else { throw ActivityAccountError.incompleteResponse }
        return self
    }
}

struct ActivityScheduledRide: Decodable, Identifiable, Sendable {
    let day: String
    let start: Double
    let stop: Double
    var id: String { day }
    var date: Date { Date(timeIntervalSince1970: start / 1000) }
    var end: Date { Date(timeIntervalSince1970: stop / 1000) }
}

struct ActivityFitnessPage: Decodable, Sendable {
    let acts: [ActivityWorkout]
    let more: Bool?
}

struct ActivityWorkout: Decodable, Identifiable, Sendable {
    let id: String
    let start: Double
    let sport: String
    let indoor: Bool
    let name: String
    let device: String?
    let sum: Summary?

    struct Summary: Decodable, Sendable {
        let secs: Double?
        let moving: Double?
        let dist: Double?
        let ascent: Double?
        let avgPwr: Double?
        let avgHr: Double?
        let kcal: Double?
        let route: [Double]?

        var duration: Double? {
            if let moving, moving > 0 { return moving }
            return secs
        }
    }

    var date: Date { Date(timeIntervalSince1970: start / 1000) }

    var category: String {
        switch sport {
        case "ride": indoor ? "Indoor ride" : "Ride"
        case "run": "Run"
        case "swim": "Swim"
        case "strength": "Strength"
        case "walk": "Walk"
        default: "Activity"
        }
    }

    var symbol: String {
        switch sport {
        case "ride": "bicycle"
        case "run": "figure.run"
        case "swim": "figure.pool.swim"
        case "strength": "dumbbell"
        case "walk": "figure.walk"
        default: "figure.mixed.cardio"
        }
    }
}

struct ActivityFitnessRoute: Decodable, Sendable {
    let plan: Plan?

    struct Plan: Decodable, Sendable {
        let route: Route
        let day: String
        let time: String
        let tz: String

        var departure: Date? {
            guard let zone = TimeZone(identifier: tz) else { return nil }
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = zone
            formatter.dateFormat = "yyyy-MM-dd HH:mm"
            return formatter.date(from: "\(day) \(time)")
        }
    }

    struct Route: Decodable, Sendable {
        let name: String
        let surface: String
        let metres: Double
        let ascent: Double?
        let coords: [[Double?]]
        let start: [Double]
        let provider: String?
    }
}
