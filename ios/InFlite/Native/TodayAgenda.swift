import Foundation

enum TodayAgendaDestination: Equatable {
    case app(InFliteRoute)
    case calendarEvent(String)
    case reminder(String)
    case chat(String, group: Bool?)
    case mailThread(String)
    case weatherRadar
    case weatherForecast
    case weatherWarnings
    case fitnessActivities

    var route: InFliteRoute {
        switch self {
        case .app(let route): route
        case .calendarEvent: .calendar
        case .reminder: .reminders
        case .chat: .chats
        case .mailThread: .mail
        case .weatherRadar, .weatherForecast, .weatherWarnings: .weather
        case .fitnessActivities: .fitness
        }
    }

    static func resolve(_ event: BackendTodayEvent, waiting: Bool) -> Self? {
        let source = event.app.flatMap { InFliteRoute(rawValue: $0 == "chat" ? "chats" : $0) }
        if let destination = event.href.flatMap(Self.reference), source == nil || destination.route == source {
            return destination
        }
        if waiting, event.app == nil, event.href == nil, event.first != nil,
           let id = event.group?.id ?? event.id, validID(id, range: 8...64) {
            return .chat(id, group: event.group != nil)
        }
        if let id = event.id, validID(id, range: 32...32) {
            if source == .calendar { return .calendarEvent(id) }
            if source == .reminders { return .reminder(id) }
        }
        switch source {
        case .weather, .markets, .fitness, .mail, .chats, .calendar, .reminders:
            return source.map(Self.app)
        default: return nil
        }
    }

    private static func reference(_ href: String) -> Self? {
        guard href.utf8.count <= 600, !href.contains("\\"),
              let url = URLComponents(string: href), url.user == nil, url.password == nil,
              url.port == nil, url.percentEncodedQuery == nil else { return nil }
        let path: String
        if url.scheme == nil, url.host == nil, href.hasPrefix("/"), !href.hasPrefix("//") {
            path = url.percentEncodedPath
        } else {
            guard url.scheme?.lowercased() == "https" else { return nil }
            switch (url.host?.lowercased(), url.percentEncodedPath) {
            case ("inflite.ai", _): path = url.percentEncodedPath
            case ("email.inflite.ai", "/"), ("email.inflite.ai", ""): path = "/mail/"
            case ("chat.inflite.ai", "/"), ("chat.inflite.ai", ""): path = "/chats/"
            case ("weather.inflite.ai", "/"), ("weather.inflite.ai", ""): path = "/weather/"
            default: return nil
            }
        }
        guard let fragment = url.percentEncodedFragment else { return nil }
        switch (path, fragment) {
        case ("/weather/", "radar"): return .weatherRadar
        case ("/weather/", "warnings"): return .weatherWarnings
        case ("/fitness/", "activities"): return .fitnessActivities
        default: break
        }
        let parts = fragment.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let id = String(parts[1])
        switch (path, parts[0]) {
        case ("/calendar/", "item") where validID(id, range: 32...32): return .calendarEvent(id)
        case ("/reminders/", "item") where validID(id, range: 32...32): return .reminder(id)
        case ("/mail/", "thread") where validID(id, range: 1...64): return .mailThread(id)
        case ("/chats/", "open") where validID(id, range: 8...64): return .chat(id, group: nil)
        case ("/weather/", "day") where
            id.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil: return .weatherForecast
        default: return nil
        }
    }

    private static func validID(_ id: String, range: ClosedRange<Int>) -> Bool {
        range.contains(id.utf8.count) && id.utf8.allSatisfy {
            (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95
        }
    }
}

struct TodayAgendaLaunch: Identifiable, Equatable {
    let id = UUID()
    let destination: TodayAgendaDestination
}

struct TodayAgendaEntry: Identifiable {
    let id: String
    let title: String
    let detail: String?
    let time: Date?
    let allDay: Bool
    let destination: TodayAgendaDestination?
    var connectedEvent: OrganiseRecord? = nil
    var reminder: NativeReminder? = nil

    init(event: BackendTodayEvent, index: Int, waiting: Bool) {
        id = "today-\(event.id ?? String(index))-\(index)"
        title = event.title ?? event.group?.name ?? event.name ?? event.first ?? (waiting ? "Waiting" : "Coming up")
        detail = event.sub ?? event.group.map { "From \(event.first ?? $0.name)" }
        time = event.at.flatMap { $0.isFinite ? Date(timeIntervalSince1970: $0 / 1000) : nil }
        allDay = false
        destination = TodayAgendaDestination.resolve(event, waiting: waiting)
    }

    init(calendar: OrganiseRecord) {
        time = calendar.eventStart
        id = "calendar-\(calendar.id)-\(String(describing: calendar.start ?? 0))-\(calendar.startDate ?? "")"
        title = calendar.title
        detail = calendar.calendarName
        allDay = calendar.allDay == true
        connectedEvent = calendar.readOnly == true ? calendar : nil
        destination = .calendarEvent(calendar.id)
    }

    init(reminder: NativeReminder) {
        id = "reminder-\(reminder.id)"
        title = reminder.title
        detail = reminder.recurrence == nil ? "Reminder" : "Repeating reminder"
        time = reminder.dueAt.map(OrganiseDate.date)
        allDay = false
        destination = .reminder(reminder.id)
        self.reminder = reminder
    }
}

struct TodayAgendaService {
    let owner: String

    struct Snapshot {
        let events: [OrganiseRecord]?
        let reminders: [NativeReminder]?
    }

    private struct Preferences: Decodable {
        struct Values: Decodable { let hidden: [String] }
        let prefs: Values
    }

    func load(now: Date = .now) async throws -> Snapshot {
        let preferences = try await BackendClient.shared.request(
            Preferences.self, path: "/api/organise/preferences", owner: owner
        )
        let hidden = Set(preferences.prefs.hidden)
        let first = OrganiseDate.calendar.startOfDay(for: now)
        let range = OrganiseRange(first: first, end: OrganiseDate.addingDays(7, to: first))
        async let eventList = events(in: range, now: now, hidden: hidden.contains("calendar"))
        async let reminderList = reminders(hidden: hidden.contains("reminders"))
        return await Snapshot(events: eventList, reminders: reminderList)
    }

    private func events(in range: OrganiseRange, now: Date, hidden: Bool) async -> [OrganiseRecord]? {
        guard !hidden else { return [] }
        let service = OrganiseService(owner: owner)
        async let own = try? service.list(.calendar, query: "", cursor: nil, range: range)
        async let connected = try? service.connectedEvents(in: range)
        let (page, feed) = await (own, connected)
        guard page != nil || feed != nil else { return nil }
        return ((page?.records ?? []) + (feed ?? []))
            .filter { event in
                guard event.eventStart != nil else { return false }
                return (event.eventEnd ?? event.eventStart ?? .distantPast) > now
            }
            .sorted { ($0.eventStart ?? .distantFuture) < ($1.eventStart ?? .distantFuture) }
            .prefix(12).map { $0 }
    }

    private func reminders(hidden: Bool) async -> [NativeReminder]? {
        guard !hidden else { return [] }
        return try? await NativeReminderService(owner: owner).today().filter { $0.status == "open" }
    }
}
