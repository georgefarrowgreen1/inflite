import CryptoKit
import SwiftUI
import UIKit
import UserNotifications

struct NativeDeviceNotification: Codable, Identifiable {
    let id: String
    let app: String
    let title: String
    let body: String
    let date: Date
    var read: Bool

    var destination: InFliteRoute? {
        InFliteRoute(rawValue: app == "chat" ? "chats" : app)
    }
}

@MainActor
final class NativeNotificationStore: ObservableObject {
    static let shared = NativeNotificationStore()

    private struct History: Codable {
        var items: [NativeDeviceNotification] = []
        var cleared: [String: Date] = [:]
    }

    @Published private var histories: [String: History] = [:]

    func items(for owner: String) -> [NativeDeviceNotification] {
        histories[owner]?.items ?? []
    }

    func unread(for owner: String) -> Int {
        items(for: owner).filter { !$0.read }.count
    }

    func refresh(owner: String) async {
        // Only accept a delivered notification explicitly addressed to this account.
        // A notification can still be present in Notification Center after sign-out.
        let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
        guard !Task.isCancelled else { return }
        var history = history(for: owner)
        var byID = Dictionary(uniqueKeysWithValues: history.items.map { ($0.id, $0) })
        for notification in delivered {
            let request = notification.request
            let content = request.content
            let data = content.userInfo
            let id = request.identifier
            guard data["owner"] as? String == owner,
                  history.cleared[id] == nil,
                  let app = data["app"] as? String,
                  InFliteRoute(rawValue: app == "chat" ? "chats" : app) != nil else { continue }
            if let previous = byID[id], previous.date >= notification.date { continue }
            byID[id] = NativeDeviceNotification(
                id: id,
                app: app,
                title: String(content.title.prefix(200)),
                body: String(content.body.prefix(600)),
                date: notification.date,
                read: false
            )
        }
        history.items = Array(byID.values)
        save(history, owner: owner)
    }

    func markRead(_ ids: Set<String>, owner: String) {
        var history = history(for: owner)
        for index in history.items.indices where ids.contains(history.items[index].id) {
            history.items[index].read = true
        }
        save(history, owner: owner)
    }

    @discardableResult
    func clear(_ ids: Set<String>, owner: String) -> [NativeDeviceNotification] {
        var history = history(for: owner)
        let removed = history.items.filter { ids.contains($0.id) }
        guard !removed.isEmpty else { return [] }
        history.items.removeAll { ids.contains($0.id) }
        for item in removed { history.cleared[item.id] = .now }
        save(history, owner: owner)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: removed.map(\.id))
        return removed
    }

    func restore(_ items: [NativeDeviceNotification], owner: String) {
        var history = history(for: owner)
        for item in items where history.cleared.removeValue(forKey: item.id) != nil {
            history.items.append(item)
        }
        save(history, owner: owner)
    }

    private func history(for owner: String) -> History {
        if let stored = histories[owner] { return stored }
        guard let url = file(for: owner),
              let data = try? Data(contentsOf: url),
              let history = try? JSONDecoder().decode(History.self, from: data) else { return History() }
        return history
    }

    private func save(_ history: History, owner: String) {
        let cutoff = Date.now.addingTimeInterval(-30 * 24 * 60 * 60)
        var trimmed = history
        trimmed.items = Array(history.items.filter { $0.date >= cutoff }.sorted { $0.date > $1.date }.prefix(100))
        trimmed.cleared = history.cleared.filter { $0.value >= cutoff }
        histories[owner] = trimmed
        guard let url = file(for: owner), let data = try? JSONEncoder().encode(trimmed) else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
        } catch {
            // The inbox remains usable in memory when protected storage is unavailable.
        }
    }

    private func file(for owner: String) -> URL? {
        let key = SHA256.hash(data: Data(owner.utf8)).map { String(format: "%02x", $0) }.joined()
        return URL.applicationSupportDirectory.appending(path: "InFlite/Notifications", directoryHint: .isDirectory)
            .appending(path: key + ".json", directoryHint: .notDirectory)
    }
}

@MainActor
struct NativeNotificationsView: View {
    let owner: String
    let open: (InFliteRoute) -> Void
    @ObservedObject private var store = NativeNotificationStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var unreadOnly = false
    @State private var confirmingClear = false
    @State private var undo: [NativeDeviceNotification] = []

    private var items: [NativeDeviceNotification] { store.items(for: owner) }
    private var count: Int { store.unread(for: owner) }
    private var visible: [NativeDeviceNotification] { unreadOnly ? items.filter { !$0.read } : items }

    var body: some View {
        List {
            Picker("Show notifications", selection: $unreadOnly) {
                Text("All").tag(false)
                Text(count == 0 ? "Unread" : "Unread (\(count))").tag(true)
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if !undo.isEmpty {
                HStack {
                    Text(undo.count == 1 ? "Notification cleared" : "\(undo.count) notifications cleared")
                    Spacer()
                    Button("Undo") {
                        store.restore(undo, owner: owner)
                        undo = []
                    }
                    .buttonStyle(.borderless)
                }
            }

            if visible.isEmpty {
                ContentUnavailableView(
                    unreadOnly ? "No unread notifications" : "No notifications",
                    systemImage: "bell",
                    description: Text(unreadOnly ? "You’re all caught up." : "Notifications delivered to this iPhone appear here.")
                )
                .listRowBackground(Color.clear)
            } else {
                ForEach(["Today", "Yesterday", "Earlier"], id: \.self) { day in
                    let group = visible.filter { section(for: $0.date) == day }
                    if !group.isEmpty {
                        Section(day) { ForEach(group, content: row) }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Notifications")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Mark all read", systemImage: "checkmark.circle") {
                        store.markRead(Set(items.map(\.id)), owner: owner)
                    }
                    .disabled(count == 0)
                    Button("Clear all", systemImage: "trash", role: .destructive) { confirmingClear = true }
                        .disabled(items.isEmpty)
                    NavigationLink {
                        NativeNotificationSettingsView(owner: owner)
                    } label: {
                        Label("Notification settings", systemImage: "gearshape")
                    }
                } label: {
                    Label("Notification actions", systemImage: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Clear all notifications?", isPresented: $confirmingClear, titleVisibility: .visible) {
            Button("Clear all", role: .destructive) {
                undo = store.clear(Set(items.map(\.id)), owner: owner)
            }
        }
        .task(id: scenePhase) {
            if scenePhase == .active { await store.refresh(owner: owner) }
        }
        .refreshable { await store.refresh(owner: owner) }
    }

    private func row(_ item: NativeDeviceNotification) -> some View {
        Button {
            store.markRead([item.id], owner: owner)
            if let destination = item.destination, destination != .notifications { open(destination) }
        } label: {
            HStack(alignment: .top, spacing: 11) {
                if let destination = item.destination {
                    NativeAppIcon(route: destination, size: 33)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(item.title.isEmpty ? item.destination?.title ?? "InFlite" : item.title)
                            .font(.subheadline.weight(item.read ? .medium : .semibold))
                        Spacer(minLength: 4)
                        Text(item.date, style: .relative)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !item.body.isEmpty {
                        Text(item.body).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                if !item.read {
                    Circle().fill(NativeStyle.accent).frame(width: 7, height: 7).padding(.top, 5)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(.primary)
        }
        .accessibilityValue(item.read ? "Read" : "Unread")
        .swipeActions(allowsFullSwipe: false) {
            Button("Clear", systemImage: "trash", role: .destructive) {
                undo = store.clear([item.id], owner: owner)
            }
        }
    }

    private func section(for date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        return calendar.isDateInYesterday(date) ? "Yesterday" : "Earlier"
    }
}

private struct NativeNotificationPreferences: Decodable {
    struct Quiet: Decodable { let on: Bool; let from: Int; let to: Int }
    struct Chat: Decodable { let kinds: [String: Bool]; let names: Bool; let email: Bool }
    struct Markets: Decodable { let off: Bool?; let wrap: Bool? }
    struct Today: Decodable { let on: Bool; let at: Int }
    struct Fitness: Decodable { let morning: Bool }
    struct Mail: Decodable { let inflite: Bool? }
    struct Account: Decodable { let fixed: Bool }
    struct Weather: Decodable {
        struct Place: Decodable, Identifiable {
            let name: String
            let lat: Double
            let lon: Double
            let rain: Bool
            let warn: Bool
            var id: String { "\(lat),\(lon)" }
        }
        let places: [Place]
        let email: [String: Bool]?
    }
    let quiet: Quiet?
    let chat: Chat?
    let weather: Weather?
    let markets: Markets?
    let today: Today?
    let fitness: Fitness?
    let mail: Mail?
    let account: Account?
}

@MainActor
struct NativeNotificationSettingsView: View {
    let owner: String

    @State private var prefs: NativeNotificationPreferences?
    @State private var authorization: UNAuthorizationStatus = .notDetermined
    @State private var busy = false
    @State private var issue: String?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    var body: some View {
        Form {
            Section("This iPhone") {
                LabeledContent("System permission", value: permission)
                if authorization == .notDetermined {
                    Button("Allow notifications") { Task { await allow() } }
                } else if authorization == .denied {
                    Button("Open iOS Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                }
            }
            if let issue {
                Section { Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary) }
            }
            if let prefs {
                if let quiet = prefs.quiet {
                    Section("Quiet hours") {
                        toggle("Quiet hours", quiet.on, "quiet", "on", extra: ["tz": TimeZone.current.identifier])
                        if quiet.on {
                            hourPicker("From", quiet.from, "from")
                            hourPicker("Until", quiet.to, "to")
                        }
                    }
                }
                if let today = prefs.today {
                    Section("Today") {
                        toggle("Morning briefing", today.on, "today", "on", extra: ["tz": TimeZone.current.identifier])
                        if today.on {
                            DatePicker("Time", selection: Binding {
                                Calendar.current.date(bySettingHour: today.at / 60, minute: today.at % 60, second: 0, of: .now) ?? .now
                            } set: { date in
                                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                                let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
                                update(["today": ["at": minute, "tz": TimeZone.current.identifier]])
                            }, displayedComponents: .hourAndMinute)
                        }
                    }
                }
                if let chat = prefs.chat {
                    Section("Chats") {
                        toggle("New messages", chat.kinds["messages"] ?? false, "chat", "messages")
                        toggle("Show sender names", chat.names, "chat", "names")
                        toggle("Email notifications", chat.email, "chat", "email")
                    }
                }
                if let weather = prefs.weather {
                    if let email = weather.email {
                        Section("Weather email") {
                            Toggle("Warnings", isOn: weatherEmail("warn", email))
                            Toggle("Briefing", isOn: weatherEmail("brief", email))
                        }
                    }
                    ForEach(weather.places) { place in
                        Section(place.name) {
                            Toggle("Rain notifications", isOn: weatherToggle(place.rain, "rain", at: place))
                            Toggle("Weather warnings", isOn: weatherToggle(place.warn, "warn", at: place))
                        }
                    }
                }
                if let markets = prefs.markets {
                    Section("Markets") {
                        toggle("Price alerts", markets.off != true, "markets", "alerts")
                        toggle("Evening wrap", markets.wrap != false, "markets", "wrap")
                    }
                }
                if let fitness = prefs.fitness {
                    Section("Fitness") { toggle("Morning reminder", fitness.morning, "fitness", "morning") }
                }
                if let enabled = prefs.mail?.inflite {
                    Section("Mail") { toggle("InFlite notifications", enabled, "mail", "inflite") }
                }
                if let account = prefs.account {
                    Section("Account") { toggle("Updates on reported problems", account.fixed, "account", "fixed") }
                }
            } else {
                Section("Account preferences") {
                    if busy || issue == nil {
                        ProgressView("Loading settings")
                    } else {
                        Button("Try again") { Task { await load() } }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("Notification settings")
        .disabled(busy)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            if prefs == nil { await load() }
        }
        .refreshable { await load() }
    }

    private var permission: String {
        switch authorization {
        case .authorized, .provisional, .ephemeral: "Allowed"
        case .denied: "Off"
        default: "Not requested"
        }
    }

    private func allow() async {
        do {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        } catch {
            issue = "iOS couldn’t change notification permissions."
        }
    }

    private func load() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            prefs = try await BackendClient.shared.request(NativeNotificationPreferences.self, path: "/api/notify", owner: owner)
            issue = nil
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func update(_ changes: [String: Any]) {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let body = try JSONSerialization.data(withJSONObject: changes)
                prefs = try await BackendClient.shared.request(
                    NativeNotificationPreferences.self, path: "/api/notify", method: "PATCH", body: body, owner: owner
                )
                issue = nil
            } catch is CancellationError {
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func toggle(_ label: String, _ value: Bool, _ app: String, _ key: String, extra: [String: Any] = [:]) -> some View {
        Toggle(label, isOn: Binding { value } set: { enabled in
            var patch = extra
            patch[key] = enabled
            update([app: patch])
        })
    }

    private func hourPicker(_ label: String, _ value: Int, _ key: String) -> some View {
        Picker(label, selection: Binding { value } set: { update(["quiet": [key: $0, "tz": TimeZone.current.identifier]]) }) {
            ForEach(0..<24) { hour in
                let date = Calendar.current.date(bySettingHour: hour, minute: 0, second: 0, of: .now) ?? .now
                Text(date, format: .dateTime.hour().minute()).tag(hour)
            }
        }
    }

    private func weatherToggle(_ value: Bool, _ key: String, at place: NativeNotificationPreferences.Weather.Place) -> Binding<Bool> {
        Binding { value } set: { enabled in
            let location: [String: Any] = ["name": place.name, "lat": place.lat, "lon": place.lon, key: enabled]
            update(["weather": ["place": location]])
        }
    }

    private func weatherEmail(_ key: String, _ values: [String: Bool]) -> Binding<Bool> {
        Binding { values[key] ?? false } set: { update(["weather": ["email": [key: $0]]]) }
    }
}
