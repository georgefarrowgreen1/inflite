import Foundation

enum OrganiseKind: String, Codable {
    case notes, calendar

    var title: String { self == .notes ? "Notes" : "Calendar" }
    var itemName: String { self == .notes ? "note" : "event" }
    var icon: String { self == .notes ? "note.text" : "calendar" }
}

struct OrganiseLink: Codable, Equatable {
    let app: String
    let id: String?
    let item: String?
}

struct OrganiseCheck: Codable, Equatable, Identifiable {
    var id = OrganiseService.identifier()
    var text = ""
    var done = false
}

struct OrganiseRecord: Decodable, Identifiable {
    let id: String
    let title: String
    let version: Int?
    let updatedAt: Int64?
    let preview: String?
    let matchPreview: String?
    let checkCount: Int?
    let doneCount: Int?
    let text: String?
    let checklist: [OrganiseCheck]?
    let links: [OrganiseLink]?
    let description: String?
    let allDay: Bool?
    let timezone: String?
    let start: Int64?
    let end: Int64?
    let startDate: String?
    let endDate: String?
    let readOnly: Bool?
    let calendarName: String?

    var eventStart: Date? {
        if allDay == true { return startDate.flatMap(OrganiseDate.day) }
        return start.map(OrganiseDate.date)
    }

    var eventEnd: Date? {
        if allDay == true { return endDate.flatMap(OrganiseDate.day) }
        return end.map(OrganiseDate.date)
    }
}

struct OrganiseValue: Codable, Equatable {
    let title: String
    let links: [OrganiseLink]
    var text: String?
    var checklist: [OrganiseCheck]?
    var description: String?
    var allDay: Bool?
    var timezone: String?
    var start: Int64?
    var end: Int64?
    var startDate: String?
    var endDate: String?
}

struct OrganisePage: Decodable {
    let records: [OrganiseRecord]
    let cursor: String?
}

struct OrganiseRange: Hashable {
    let first: Date
    let end: Date
}

enum OrganiseDate {
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        calendar.firstWeekday = 2
        return calendar
    }

    static func addingDays(_ count: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: count, to: date) ?? date
    }

    static func week(containing date: Date) -> OrganiseRange {
        let first = calendar.dateInterval(of: .weekOfYear, for: date)?.start
            ?? calendar.startOfDay(for: date)
        return OrganiseRange(first: first, end: addingDays(7, to: first))
    }

    static func day(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1
        )
    }

    static func day(_ value: String) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func stamp(_ date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1_000).rounded())
    }

    static func date(_ stamp: Int64) -> Date {
        Date(timeIntervalSince1970: Double(stamp) / 1_000)
    }
}

struct OrganiseService {
    let owner: String

    func list(_ kind: OrganiseKind, query: String, cursor: String?, range: OrganiseRange?) async throws -> OrganisePage {
        let request = ListRequest(
            kind: kind, q: query, cursor: cursor,
            fromDate: range.map { OrganiseDate.day($0.first) },
            toDate: range.map { OrganiseDate.day($0.end) },
            from: range.map { OrganiseDate.stamp($0.first) },
            to: range.map { OrganiseDate.stamp($0.end) }
        )
        return try await BackendClient.shared.request(
            OrganisePage.self, path: "/api/organise/list", method: "POST",
            body: JSONEncoder().encode(request), owner: owner
        )
    }

    func record(_ kind: OrganiseKind, id: String) async throws -> OrganiseRecord {
        let result = try await BackendClient.shared.request(
            RecordResult.self, path: "/api/organise/record",
            query: [URLQueryItem(name: "kind", value: kind.rawValue), URLQueryItem(name: "id", value: id)],
            owner: owner
        )
        return result.record
    }

    func connectedEvents(in range: OrganiseRange) async throws -> [OrganiseRecord] {
        let request = FeedRequest(from: OrganiseDate.stamp(range.first), to: OrganiseDate.stamp(range.end))
        let result = try await BackendClient.shared.request(
            FeedResult.self, path: "/api/organise/calendar-events", method: "POST",
            body: JSONEncoder().encode(request), owner: owner
        )
        return result.events
    }

    func save(_ operation: OrganiseSave) async throws -> OrganiseRecord {
        let result = try await BackendClient.shared.request(
            RecordResult.self, path: "/api/organise/record", method: "PUT",
            body: operation.body, owner: owner
        )
        return result.record
    }

    static func identifier() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    private struct ListRequest: Encodable {
        let kind: OrganiseKind
        let q: String
        let cursor: String?
        let fromDate: String?
        let toDate: String?
        let from: Int64?
        let to: Int64?
    }

    private struct RecordResult: Decodable { let record: OrganiseRecord }
    private struct FeedResult: Decodable { let events: [OrganiseRecord] }
    private struct FeedRequest: Encodable { let from: Int64; let to: Int64 }
}

struct OrganiseSave {
    let value: OrganiseValue
    let body: Data

    init(kind: OrganiseKind, id: String, version: Int, value: OrganiseValue) throws {
        self.value = value
        // The worker hashes the complete request for idempotency. Keep these exact
        // bytes in the editor until the operation is acknowledged.
        body = try JSONEncoder().encode(
            Request(kind: kind, id: id, version: version, operationId: OrganiseService.identifier(), value: value)
        )
    }

    private struct Request: Encodable {
        let kind: OrganiseKind
        let id: String
        let version: Int
        let operationId: String
        let value: OrganiseValue
        let deleted = false
    }
}
