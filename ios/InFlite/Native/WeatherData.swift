import Foundation

struct WeatherPlace: Codable, Equatable, Hashable {
    let name: String
    let region: String?
    let lat: Double
    let lon: Double

    static let london = WeatherPlace(name: "London", region: "United Kingdom", lat: 51.5072, lon: -0.1276)

    var isValid: Bool {
        !name.isEmpty && lat.isFinite && lon.isFinite && abs(lat) <= 90 && abs(lon) <= 180
    }
}

struct WeatherForecast: Decodable {
    struct Current: Decodable {
        let time: Int
        let temperature: Double?
        let feelsLike: Double?
        let code: Int?
        let isDay: Int?
        let humidity: Int?
        let wind: Double?
        let windGusts: Double?
        let uv: Double?

        enum CodingKeys: String, CodingKey {
            case time
            case temperature = "temperature_2m"
            case feelsLike = "apparent_temperature"
            case code = "weather_code"
            case isDay = "is_day"
            case humidity = "relative_humidity_2m"
            case wind = "wind_speed_10m"
            case windGusts = "wind_gusts_10m"
            case uv = "uv_index"
        }
    }

    struct Hourly: Decodable {
        let time: [Int]
        let temperature: [Double?]?
        let code: [Int?]?
        let rainChance: [Int?]?
        let isDay: [Int?]?

        enum CodingKeys: String, CodingKey {
            case time
            case temperature = "temperature_2m"
            case code = "weather_code"
            case rainChance = "precipitation_probability"
            case isDay = "is_day"
        }

        func readings(after currentTime: Int) -> [Hour] {
            time.enumerated().filter { $0.element + 3600 > currentTime }.prefix(48).map { index, time in
                Hour(id: time, temperature: weatherSample(temperature, index), code: weatherSample(code, index),
                     rainChance: weatherSample(rainChance, index), isDay: weatherSample(isDay, index) != 0)
            }
        }
    }

    struct Daily: Decodable {
        let time: [Int]
        let high: [Double?]?
        let low: [Double?]?
        let code: [Int?]?
        let rainChance: [Int?]?
        let sunrise: [Int?]?
        let sunset: [Int?]?

        enum CodingKeys: String, CodingKey {
            case time, sunrise, sunset
            case high = "temperature_2m_max"
            case low = "temperature_2m_min"
            case code = "weather_code"
            case rainChance = "precipitation_probability_max"
        }

        var readings: [Day] {
            time.enumerated().prefix(16).map { index, time in
                Day(id: time, high: weatherSample(high, index), low: weatherSample(low, index),
                    code: weatherSample(code, index), rainChance: weatherSample(rainChance, index),
                    sunrise: weatherSample(sunrise, index), sunset: weatherSample(sunset, index))
            }
        }
    }

    struct MinuteRain: Decodable {
        let time: [Int]
        let precipitation: [Double?]
    }

    struct Hour: Identifiable {
        let id: Int
        let temperature: Double?
        let code: Int?
        let rainChance: Int?
        let isDay: Bool
    }

    struct Day: Identifiable {
        let id: Int
        let high: Double?
        let low: Double?
        let code: Int?
        let rainChance: Int?
        let sunrise: Int?
        let sunset: Int?
    }

    let timezone: String
    let current: Current
    let hourly: Hourly
    let daily: Daily
    let minuteRain: MinuteRain?

    enum CodingKeys: String, CodingKey {
        case timezone, current, hourly, daily
        case minuteRain = "minutely_15"
    }

    var timeZone: TimeZone { TimeZone(identifier: timezone) ?? .gmt }

    func time(_ timestamp: Int) -> String {
        Date(timeIntervalSince1970: TimeInterval(timestamp))
            .formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone))
    }

    func weekday(_ timestamp: Int) -> String {
        var style = Date.FormatStyle().weekday(.wide)
        style.timeZone = timeZone
        return Date(timeIntervalSince1970: TimeInterval(timestamp)).formatted(style)
    }

    var shortRainOutlook: String? {
        guard let minuteRain else { return nil }
        // Open-Meteo reports the rain accumulated in the quarter hour ending at each timestamp.
        let nextQuarters = zip(minuteRain.time, minuteRain.precipitation)
            .filter { $0.0 > current.time && $0.0 <= current.time + 4 * 3600 }
        if let wet = nextQuarters.first(where: { ($0.1 ?? 0) >= 0.1 }) {
            let begins = wet.0 - 900
            return begins <= current.time ? "Rain now" : "Rain from about \(time(begins))"
        }
        guard nextQuarters.count >= 15, nextQuarters.allSatisfy({ $0.1 != nil }) else { return nil }
        return "Dry for the next four hours"
    }
}

private func weatherSample<Value>(_ values: [Value?]?, _ index: Int) -> Value? {
    guard let values, values.indices.contains(index) else { return nil }
    return values[index]
}

struct WeatherWarningFeed: Decodable {
    let warnings: [Warning]
    let uncovered: Bool?
    let missing: [String]?

    func retainingWarnings(from previous: WeatherWarningFeed?) -> WeatherWarningFeed {
        guard let missing, !missing.isEmpty, let previous else { return self }
        let received = Set(warnings.map(\.id))
        let kept = previous.warnings.filter { item in
            guard let source = item.source, missing.contains(source), !received.contains(item.id) else { return false }
            guard let expiry = item.expires else { return true }
            let parser = ISO8601DateFormatter()
            parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = parser.date(from: expiry) { return date > .now }
            parser.formatOptions = [.withInternetDateTime]
            return parser.date(from: expiry).map { $0 > .now } ?? false
        }
        let warnings = (warnings + kept).sorted { $0.level > $1.level }
        return WeatherWarningFeed(warnings: warnings, uncovered: uncovered, missing: missing)
    }

    struct Warning: Decodable, Identifiable {
        let id: String
        let event: String
        let level: Int
        let issuer: String?
        let headline: String?
        let description: String?
        let instruction: String?
        let area: String?
        let link: URL?
        let source: String?
        let expires: String?

        enum CodingKeys: String, CodingKey {
            case id, event, level, issuer, headline, instruction, area, expires
            case description = "text"
            case link = "url"
            case source = "src"
        }
    }
}

struct WeatherRadarFeed: Decodable {
    let host: String
    let radar: Radar

    struct Radar: Decodable {
        let past: [Frame]
    }

    struct Frame: Decodable, Identifiable {
        let time: Int
        let path: String

        var id: Int { time }
        var isValid: Bool { path.range(of: #"^/v2/radar/[a-zA-Z0-9/_-]+$"#, options: .regularExpression) != nil }
    }

    var frames: [Frame] { radar.past.filter { $0.isValid }.sorted { $0.time < $1.time } }

    func tileTemplate(for frame: Frame) -> String {
        host + frame.path + "/256/{z}/{x}/{y}/2/1_1.png"
    }
}

struct WeatherClient {
    static let shared = WeatherClient()

    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config)
    }

    func approximatePlace() async throws -> WeatherPlace {
        let place: WeatherPlace = try await get("https://inflite.ai/api/weather/where")
        guard place.isValid else { throw WeatherError.invalidResponse }
        return place
    }

    func forecast(for place: WeatherPlace) async throws -> WeatherForecast {
        let fields = [
            ("latitude", coordinate(place.lat, places: 4)),
            ("longitude", coordinate(place.lon, places: 4)),
            ("timezone", "auto"),
            ("timeformat", "unixtime"),
            ("forecast_days", "16"),
            ("wind_speed_unit", "mph"),
            ("current", "temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,uv_index"),
            ("hourly", "temperature_2m,weather_code,precipitation_probability,is_day"),
            ("daily", "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset"),
            ("minutely_15", "precipitation"),
            ("forecast_minutely_15", "17")
        ]
        return try await get("https://api.open-meteo.com/v1/forecast", fields: fields)
    }

    func warnings(for place: WeatherPlace) async throws -> WeatherWarningFeed {
        return try await get("https://inflite.ai/api/weather/warnings", fields: [
            ("lat", coordinate(place.lat, places: 2)), ("lon", coordinate(place.lon, places: 2))
        ])
    }

    func radar() async throws -> WeatherRadarFeed {
        let feed: WeatherRadarFeed = try await get("https://api.rainviewer.com/public/weather-maps.json")
        guard feed.host == "https://tilecache.rainviewer.com", !feed.frames.isEmpty else {
            throw WeatherError.invalidResponse
        }
        return feed
    }

    func findPlaces(named name: String) async throws -> [WeatherPlace] {
        struct Result: Decodable {
            let name: String
            let latitude: Double
            let longitude: Double
            let admin1: String?
            let admin2: String?
            let country: String?

            var place: WeatherPlace {
                let parts = [admin2, admin1, country].compactMap { $0 }
                let region = parts.reduce(into: [String]()) { unique, part in
                    if part != name && !unique.contains(part) { unique.append(part) }
                }.joined(separator: ", ")
                return WeatherPlace(name: name, region: region, lat: latitude, lon: longitude)
            }
        }

        struct Response: Decodable { let results: [Result]? }
        let response: Response = try await get("https://geocoding-api.open-meteo.com/v1/search", fields: [
            ("name", String(name.prefix(100))), ("count", "8"), ("language", "en"), ("format", "json")
        ])
        return Array((response.results ?? []).prefix(8)).map(\.place).filter(\.isValid)
    }

    private func coordinate(_ value: Double, places: Int) -> String {
        String(format: "%.*f", locale: Locale(identifier: "en_US_POSIX"), places, value)
    }

    private func get<T: Decodable>(_ endpoint: String, fields: [(String, String)] = []) async throws -> T {
        var components = URLComponents(string: endpoint)
        if !fields.isEmpty {
            components?.queryItems = fields.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        guard let url = components?.url else { throw WeatherError.invalidResponse }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw WeatherError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else { throw WeatherError.http(response.statusCode) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private enum WeatherError: Error {
    case invalidResponse
    case http(Int)
}
