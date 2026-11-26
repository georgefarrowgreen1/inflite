import SwiftUI

struct NativeRemindersView: View {
    let owner: String
    var revision: Int = 0
    var onChanged: () -> Void = {}

    private enum Status: String, CaseIterable {
        case open, done
        var title: String { self == .open ? "Open" : "Completed" }
    }

    private enum Editor: Identifiable {
        case create, edit(String)
        var id: String {
            switch self {
            case .create: "new-reminder"
            case .edit(let id): id
            }
        }
    }

    private struct Selection: Equatable {
        let status: String
        let search: String
        let revision: Int
    }

    @State private var status: Status = .open
    @State private var items: [NativeReminder] = []
    @State private var cursor: String?
    @State private var query = ""
    @State private var refreshID = 0
    @State private var loading = true
    @State private var request = UUID()
    @State private var failure: String?
    @State private var editor: Editor?

    private var selection: Selection {
        Selection(status: status.rawValue, search: query.trimmingCharacters(in: .whitespacesAndNewlines), revision: revision + refreshID)
    }

    var body: some View {
        List {
            Section {
                Picker("Reminder state", selection: $status) {
                    ForEach(Status.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Section {
                if let failure {
                    Text(failure).foregroundStyle(.secondary)
                    Button("Try again") { refreshID += 1 }
                }
                if items.isEmpty && failure == nil && !loading {
                    if !selection.search.isEmpty {
                        ContentUnavailableView.search(text: selection.search)
                    } else {
                        ContentUnavailableView(status == .open ? "No open reminders" : "No completed reminders",
                                               systemImage: status == .open ? "bell" : "checkmark.circle")
                    }
                }
                ForEach(items) { item in
                    Button { editor = .edit(item.id) } label: {
                        HStack(spacing: 14) {
                            Image(systemName: item.status == "done" ? "checkmark.circle.fill" : "bell")
                                .font(.title3).foregroundStyle(NativeStyle.accent).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(verbatim: item.title).foregroundStyle(.primary)
                                if let due = item.dueAt {
                                    Text(OrganiseDate.date(due), format: .dateTime.weekday(.abbreviated).month().day().hour().minute())
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary).accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                if loading { ProgressView("Loading reminders") }
                if let cursor, !loading && failure == nil {
                    Button("Load older reminders") {
                        Task { await load(selection, after: cursor) }
                    }
                }
            }
        }
        .navigationTitle("Reminders")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search reminders")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { editor = .create } label: { Label("New reminder", systemImage: "plus") }
            }
        }
        .sheet(item: $editor) { editor in
            let id = editor.id == "new-reminder" ? nil : editor.id
            NativeReminderEditor(owner: owner, id: id) {
                refreshID += 1
                onChanged()
            }
        }
        .task(id: selection) {
            if !selection.search.isEmpty {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            }
            await load(selection)
        }
        .refreshable { await load(selection) }
        .scrollContentBackground(.hidden)
        .background { NativeWallpaper(animate: false) }
        .tint(NativeStyle.accent)
    }

    @MainActor
    private func load(_ key: Selection, after next: String? = nil) async {
        guard key == selection else { return }
        let token = UUID()
        request = token
        if next == nil {
            items = []
            cursor = nil
        }
        loading = true
        failure = nil
        defer { if request == token { loading = false } }
        do {
            let result = try await NativeReminderService(owner: owner).list(status: key.status, search: key.search, cursor: next)
            guard request == token, key == selection, !Task.isCancelled else { return }
            var seen = Set(items.map(\.id))
            items += result.actions.filter { $0.status == key.status && seen.insert($0.id).inserted }
            cursor = result.cursor
        } catch {
            if request == token, key == selection, !Task.isCancelled { failure = error.localizedDescription }
        }
    }
}

private struct NativeReminder: Decodable, Identifiable {
    struct Recurrence: Decodable {
        let frequency: String
        let timezone: String
    }

    let id: String
    let version: Int
    let title: String
    let status: String
    let notes: String?
    let dueAt: Int64?
    let recurrence: Recurrence?
    let notify: Bool?
}

private struct NativeReminderPage: Decodable {
    let actions: [NativeReminder]
    let cursor: String?
}

private struct NativeReminderChange {
    let fields: Data
    let body: Data

    init(fields: Data) throws {
        self.fields = fields
        guard var value = try JSONSerialization.jsonObject(with: fields) as? [String: Any] else {
            throw BackendError.invalidRequest
        }
        value["operationId"] = OrganiseService.identifier()
        body = try JSONSerialization.data(withJSONObject: value, options: .sortedKeys)
    }
}

private struct NativeReminderService {
    let owner: String
    private struct Response: Decodable { let action: NativeReminder }

    func list(status: String, search: String, cursor: String?) async throws -> NativeReminderPage {
        let client = BackendClient.shared
        if !search.isEmpty {
            let body = try JSONEncoder().encode(["q": String(search.prefix(160))])
            return try await client.request(NativeReminderPage.self, path: "/api/system/search", method: "POST", body: body, owner: owner)
        }
        var query = [URLQueryItem(name: "status", value: status)]
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        return try await client.request(NativeReminderPage.self, path: "/api/system/actions", query: query, owner: owner)
    }

    func get(_ id: String) async throws -> NativeReminder {
        let result = try await BackendClient.shared.request(
            Response.self, path: "/api/system/action", query: [.init(name: "id", value: id)], owner: owner
        )
        guard result.action.id == id else { throw BackendError.invalidResponse }
        return result.action
    }

    func write(_ change: NativeReminderChange, record: NativeReminder?) async throws {
        let result = try await BackendClient.shared.request(
            Response.self, path: record == nil ? "/api/system/actions" : "/api/system/action",
            method: record == nil ? "POST" : "PATCH", body: change.body, owner: owner
        )
        guard !result.action.id.isEmpty, record == nil || result.action.id == record?.id else {
            throw BackendError.invalidResponse
        }
    }
}

private struct NativeReminderEditor: View {
    let owner: String
    let id: String?
    let onChanged: () -> Void

    private enum Frequency: String, CaseIterable {
        case never, daily, weekly, monthly, yearly
        var title: String {
            switch self {
            case .never: "Never"
            case .daily: "Every day"
            case .weekly: "Every week"
            case .monthly: "Every month"
            case .yearly: "Every year"
            }
        }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var record: NativeReminder?
    @State private var title = ""
    @State private var notes = ""
    @State private var scheduled = true
    @State private var due = Date().addingTimeInterval(3_600)
    @State private var frequency = Frequency.never
    @State private var notify = true
    @State private var timezone = TimeZone.current.identifier
    @State private var lastChange: NativeReminderChange?
    @State private var loading = false
    @State private var busy = false
    @State private var showDelete = false
    @State private var failure: String?

    private var service: NativeReminderService { NativeReminderService(owner: owner) }

    var body: some View {
        NavigationStack {
            Form {
                if let failure { Section { Text(failure).foregroundStyle(.secondary) } }
                if loading {
                    ProgressView("Loading reminder")
                } else if id != nil && record == nil {
                    Button("Reload reminder") { Task { await load() } }
                } else {
                    fields
                    Section {
                        Button(id == nil ? "Add reminder" : "Save changes") { Task { await save() } }
                            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if let record {
                            Button(record.status == "done" ? "Reopen reminder" : "Complete reminder") {
                                Task { await save(status: record.status == "done" ? "open" : "done") }
                            }
                            Button("Delete reminder", role: .destructive) { showDelete = true }
                        }
                    }
                }
            }
            .disabled(busy)
            .scrollContentBackground(.hidden)
            .background { NativeWallpaper(animate: false) }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(id == nil ? "New reminder" : "Reminder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if busy { ProgressView().accessibilityLabel("Saving reminder") }
                    else { Button("Cancel") { dismiss() } }
                }
            }
            .confirmationDialog("Delete reminder?", isPresented: $showDelete, titleVisibility: .visible) {
                Button("Delete reminder", role: .destructive) { Task { await save(status: "deleted") } }
            }
            .task { await load() }
        }
        .tint(NativeStyle.accent)
        .interactiveDismissDisabled(busy)
    }

    private var fields: some View {
        Group {
            Section("Reminder") {
                TextField("Title", text: $title)
                TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...7)
            }
            Section("Schedule") {
                Toggle("Set a date", isOn: $scheduled)
                if scheduled {
                    DatePicker("Remind me", selection: $due)
                    Picker("Repeat", selection: $frequency) {
                        ForEach(Frequency.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    Toggle("Notify registered devices", isOn: $notify)
                }
            }
        }
    }

    @MainActor
    private func load() async {
        guard let id, !loading else { return }
        loading = true
        failure = nil
        defer { loading = false }
        do {
            let latest = try await service.get(id)
            try Task.checkCancellation()
            record = latest
            title = latest.title
            notes = latest.notes ?? ""
            scheduled = latest.dueAt != nil
            if let date = latest.dueAt { due = OrganiseDate.date(date) }
            notify = latest.notify ?? true
            frequency = latest.recurrence.flatMap { Frequency(rawValue: $0.frequency) } ?? .never
            timezone = latest.recurrence?.timezone ?? TimeZone.current.identifier
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }

    @MainActor
    private func save(status: String? = nil) async {
        guard !busy, id == nil || record != nil else { return }
        busy = true
        failure = nil
        defer { busy = false }
        do {
            var values: [String: Any] = [:]
            if let status {
                values["status"] = status
            } else {
                let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
                let detail = notes.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name.utf16.count <= 160, detail.utf16.count <= 2_000 else {
                    failure = "Use up to 160 characters for the title and 2,000 for notes."
                    return
                }
                values["title"] = name
                values["notes"] = detail
                values["dueAt"] = scheduled ? OrganiseDate.stamp(due) as Any : NSNull()
                values["notify"] = scheduled && notify
                values["recurrence"] = scheduled && frequency != .never
                    ? ["frequency": frequency.rawValue, "timezone": timezone] as Any : NSNull()
            }
            if let record {
                values["id"] = record.id
                values["version"] = record.version
            } else {
                values["source"] = NSNull()
                values["files"] = [] as [String]
            }
            let fields = try JSONSerialization.data(withJSONObject: values, options: .sortedKeys)
            let change: NativeReminderChange
            if let lastChange, lastChange.fields == fields {
                change = lastChange
            } else {
                change = try NativeReminderChange(fields: fields)
                lastChange = change
            }
            try await service.write(change, record: record)
            try Task.checkCancellation()
            onChanged()
            dismiss()
        } catch BackendError.http(409, _) {
            failure = "This reminder changed. Reopen it to review the latest version."
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }
}
