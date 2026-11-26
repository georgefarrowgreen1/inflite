import SwiftUI

@MainActor
struct ActivityStatusView: View {
    @State private var dashboard = ActivityResource<ActivityStatusSnapshot>()
    @Environment(\.isInFliteScreenVisible) private var screenVisible
    @Environment(\.scenePhase) private var scenePhase

    private var shouldPoll: Bool { screenVisible && scenePhase == .active }

    var body: some View {
        List {
            if let snapshot = dashboard.value {
                verdict(snapshot)
                services(snapshot)
                incidents(snapshot)
            }
            if dashboard.value == nil || dashboard.issue != nil {
                ActivityLoadRow(issue: dashboard.issue, retry: reload)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Status")
        .task(id: shouldPoll) {
            guard shouldPoll else { return }
            while !Task.isCancelled {
                await reload()
                do { try await Task.sleep(for: .seconds(60)) }
                catch { break }
            }
        }
        .refreshable { await reload() }
    }

    private func verdict(_ snapshot: ActivityStatusSnapshot) -> some View {
        let summary = snapshot.overview
        return Section {
            VStack(alignment: .leading, spacing: 7) {
                Label(summary.title, systemImage: summary.health.symbol)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(summary.health.color)
                if let checked = snapshot.checkedAt {
                    Text("Last checked \(checked, format: .relative(presentation: .named))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
        }
    }

    @ViewBuilder
    private func services(_ snapshot: ActivityStatusSnapshot) -> some View {
        forGroups(snapshot)
        if !snapshot.jobs.isEmpty {
            Section("Background jobs") {
                ForEach(snapshot.jobs) { item in checkRow(item) }
            }
        }
        if !snapshot.deps.isEmpty {
            Section("Dependencies") {
                ForEach(snapshot.deps) { item in checkRow(item) }
            }
        }
    }

    private func forGroups(_ snapshot: ActivityStatusSnapshot) -> some View {
        ForEach(ActivityStatusSnapshot.Group.allCases, id: \.self) { group in
            let entries = snapshot.services.filter { $0.group == group.rawValue }
            if !entries.isEmpty {
                Section(group.label) {
                    ForEach(entries) { service in
                        NavigationLink {
                            ActivityStatusServiceView(service: service)
                        } label: {
                            checkRow(service)
                        }
                    }
                }
            }
        }
    }

    private func checkRow(_ entry: ActivityStatusCheck) -> some View {
        LabeledContent {
            Label(entry.health.label, systemImage: entry.health.symbol)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(entry.health.color)
        } label: {
            Text(entry.name)
        }
    }

    @ViewBuilder
    private func incidents(_ snapshot: ActivityStatusSnapshot) -> some View {
        let upcoming = snapshot.maint.filter { $0.end > .now }
        if !upcoming.isEmpty {
            Section("Maintenance") {
                ForEach(upcoming) { work in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(work.title).font(.headline)
                        Text(work.start ... work.end)
                            .font(.subheadline).foregroundStyle(.secondary)
                        if !work.text.isEmpty {
                            Text(work.text).font(.subheadline)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        Section("Recent incidents") {
            if snapshot.incidents.isEmpty {
                Text("No recent incidents").foregroundStyle(.secondary)
            }
            ForEach(snapshot.incidents) { incident in
                DisclosureGroup {
                    ForEach(incident.updates) { update in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(update.k).font(.subheadline.weight(.semibold))
                            Text(update.w).font(.subheadline)
                            Text(update.date, format: .dateTime.month(.abbreviated).day().hour().minute())
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 5)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(incident.title).font(.body.weight(.medium))
                        Text(incident.ended == nil ? "In progress" : "Resolved")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
    }

    private func reload() async {
        await dashboard.load { try await ActivityStatusSnapshot.fetch() }
    }
}

private struct ActivityStatusServiceView: View {
    let service: ActivityStatusCheck

    var body: some View {
        List {
            Section {
                Label(service.health.label, systemImage: service.health.symbol)
                    .foregroundStyle(service.health.color)
                    .font(.headline)
                if let note = service.why, !note.isEmpty { Text(note) }
                if let uptime = service.up90 {
                    LabeledContent("Uptime, last 90 days", value: uptime.formatted(.number.precision(.fractionLength(0...2))) + "%")
                }
                if let version = service.version {
                    LabeledContent("Version", value: version)
                }
                if let milliseconds = service.ms {
                    LabeledContent("Response time", value: "\(milliseconds.formatted()) ms")
                }
            }
            if let checks = service.checks, !checks.isEmpty {
                Section("Checks") {
                    ForEach(checks) { check in
                        LabeledContent(check.k, value: ActivityStatusHealth(rawValue: check.s).label)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(service.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ActivityStatusSnapshot: Decodable, Sendable {
    enum Group: String, CaseIterable {
        case apps, account, home

        var label: String {
            switch self {
            case .apps: "Apps"
            case .account: "Account"
            case .home: "Website"
            }
        }
    }

    let at: Double?
    let services: [ActivityStatusCheck]
    let jobs: [ActivityStatusCheck]
    let deps: [ActivityStatusCheck]
    let maint: [ActivityStatusMaintenance]
    let incidents: [ActivityStatusIncident]

    var checkedAt: Date? { at.map { Date(timeIntervalSince1970: $0 / 1000) } }

    var overview: (health: ActivityStatusHealth, title: String) {
        guard let checkedAt else { return (.pending, "Checking services") }
        if Date().timeIntervalSince(checkedAt) > 15 * 60 { return (.slow, "Status checks are delayed") }
        let checks = services + jobs + deps
        if checks.contains(where: { $0.health == .down }) { return (.down, "Service disruption") }
        if let incident = incidents.first(where: { $0.ended == nil }) { return (.slow, incident.title) }
        if let work = maint.first(where: { $0.start <= .now && $0.end > .now }) {
            return (.slow, work.title)
        }
        if checks.contains(where: { $0.health == .slow }) { return (.slow, "Some services need attention") }
        if checks.contains(where: { $0.health == .pending }) { return (.pending, "Some checks are pending") }
        return (.working, "All services operational")
    }

    // Query the independent public status host so the dashboard can still work
    // while another InFlite service is down. No account credentials are attached.
    private static let transport: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        return URLSession(configuration: config)
    }()

    static func fetch() async throws -> Self {
        guard let url = URL(string: "https://status.inflite.ai/api/status") else {
            throw BackendError.invalidRequest
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await transport.data(for: request)
        guard let http = response as? HTTPURLResponse, http.url == url,
              (200 ..< 300).contains(http.statusCode),
              response.mimeType == "application/json", data.count <= 2 * 1024 * 1024,
              let snapshot = try? JSONDecoder().decode(Self.self, from: data),
              !snapshot.services.isEmpty else {
            throw BackendError.invalidResponse
        }
        return snapshot
    }
}

private struct ActivityStatusCheck: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let s: String
    let group: String?
    let ms: Double?
    let version: String?
    let why: String?
    let up90: Double?
    let checks: [Check]?

    var health: ActivityStatusHealth { ActivityStatusHealth(rawValue: s) }

    struct Check: Decodable, Identifiable, Sendable {
        let k: String
        let s: String
        var id: String { k }
    }
}

private struct ActivityStatusMaintenance: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let text: String
    let starts: Double
    let ends: Double
    var start: Date { Date(timeIntervalSince1970: starts / 1000) }
    var end: Date { Date(timeIntervalSince1970: ends / 1000) }
}

private struct ActivityStatusIncident: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let ended: Double?
    let updates: [Update]

    struct Update: Decodable, Identifiable, Sendable {
        let at: Double
        let k: String
        let w: String
        var id: String { "\(at)-\(k)" }
        var date: Date { Date(timeIntervalSince1970: at / 1000) }
    }
}

private enum ActivityStatusHealth {
    case working, slow, down, pending

    init(rawValue: String) {
        switch rawValue {
        case "ok": self = .working
        case "warn": self = .slow
        case "down": self = .down
        default: self = .pending
        }
    }

    var label: String {
        switch self {
        case .working: "Operational"
        case .slow: "Needs attention"
        case .down: "Unavailable"
        case .pending: "Not checked"
        }
    }

    var symbol: String {
        switch self {
        case .working: "checkmark.circle.fill"
        case .slow: "exclamationmark.circle.fill"
        case .down: "xmark.circle.fill"
        case .pending: "clock"
        }
    }

    var color: Color {
        switch self {
        case .working: .green
        case .slow: .orange
        case .down: .red
        case .pending: .secondary
        }
    }
}
