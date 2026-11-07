import Foundation

public enum JSONValue: Codable, Equatable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    public subscript(_ key: String) -> JSONValue { if case .object(let o) = self { return o[key] ?? .null }; return .null }
    public var text: String? { if case .string(let s) = self { return s }; return nil }
    public var number: Double? { if case .number(let n) = self { return n }; return nil }
    public var list: [JSONValue] { if case .array(let a) = self { return a }; return [] }
}

public struct SessionView: Codable, Sendable {
    public var signedIn: Bool
    public var user: SessionUser?
    public var prefs: CardPreferences?
    public var apps: [String: Bool]?
    public var quiet: QuietHours?
}
public struct SessionUser: Codable, Sendable {
    public var id: String
    public var name: String?
    public var first: String?
    public var handle: String?
    public var appearance: String?
}
public struct CardPreferences: Codable, Sendable {
    public var order: [String]
    public var hidden: [String]
    public init(order: [String], hidden: [String]) { self.order = order; self.hidden = hidden }
}
public struct QuietHours: Codable, Sendable {
    public var on: Bool
    public var from: Int
    public var to: Int
    public var tz: String?
    public init(on: Bool, from: Int, to: Int, tz: String?) { self.on = on; self.from = from; self.to = to; self.tz = tz }
}
public struct MorningSettings: Codable, Sendable {
    public var on: Bool
    public var at: Int
    public var tz: String?
    public var devices: Int?
    public var lines: [String: Bool]?
}
public struct TodayBoot: Codable, Sendable {
    public var view: SessionView
    public var cards: TodayEnvelope?
}
public struct TodayEnvelope: Codable, Sendable {
    public var at: Double?
    public var tz: String?
    public var cards: [String: JSONValue]
    public var morning: MorningSettings?
    public var phase: String?
    public var tops: [String: JSONValue]?
    public var upcoming: [JSONValue]?
}

public enum CardKind: String, CaseIterable, Identifiable, Sendable {
    case weather, chat, fitness, markets
    public var id: String { rawValue }
    public var destination: Destination {
        switch self { case .weather: return .weather; case .chat: return .chats; case .fitness: return .fitness; case .markets: return .markets }
    }
    public static func ordered(_ prefs: CardPreferences?) -> [Self] {
        var found = Set<String>()
        return ((prefs?.order ?? []) + allCases.map(\.rawValue)).compactMap { key in
            guard let kind = Self(rawValue: key), !(prefs?.hidden.contains(key) ?? false), found.insert(key).inserted else { return nil }
            return kind
        }
    }
}
