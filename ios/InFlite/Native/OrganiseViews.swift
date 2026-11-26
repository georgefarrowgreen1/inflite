import SwiftUI

@MainActor
struct NativeNotesView: View {
    let owner: String

    var body: some View {
        OrganiseListView(kind: .notes, service: OrganiseService(owner: owner))
            .id(owner)
    }
}

@MainActor
struct NativeCalendarView: View {
    let owner: String

    var body: some View {
        OrganiseListView(kind: .calendar, service: OrganiseService(owner: owner))
            .id(owner)
    }
}

@MainActor
private struct OrganiseListView: View {
    let kind: OrganiseKind
    let service: OrganiseService

    @State private var query = ""
    @State private var day = Date()
    @State private var records: [OrganiseRecord] = []
    @State private var connected: [OrganiseRecord] = []
    @State private var cursor: String?
    @State private var loadedQuery: ListQuery?
    @State private var currentRequest: UUID?
    @State private var failure: String?
    @State private var feedFailed = false
    @State private var loading = false
    @State private var selection: Selection?

    init(kind: OrganiseKind, service: OrganiseService) {
        self.kind = kind
        self.service = service
    }

    var body: some View {
        List {
            if kind == .calendar { calendarPicker }
            if let failure, loadedQuery == listQuery {
                Section {
                    Text(failure).foregroundStyle(.secondary)
                    Button("Try Again") { Task { await load(listQuery) } }
                }
            }

            if kind == .calendar, feedFailed, loadedQuery == listQuery {
                Section {
                    Label("Connected calendars couldn’t refresh", systemImage: "exclamationmark.circle")
                        .foregroundStyle(.secondary)
                    Button("Refresh Calendars") { Task { await load(listQuery) } }
                }
            }

            if visibleRecords.isEmpty {
                if loading || loadedQuery != listQuery {
                    ProgressView(kind == .notes ? "Opening notes" : "Opening calendar")
                        .frame(maxWidth: .infinity, alignment: .center)
                } else if failure == nil, !feedFailed {
                    ContentUnavailableView(
                        emptyTitle,
                        systemImage: kind.icon,
                        description: Text(emptyDescription)
                    )
                    .listRowBackground(Color.clear)
                }
            } else {
                Section {
                    ForEach(visibleRecords) { record in
                        Button {
                            selection = record.readOnly == true ? .connected(record) : .edit(record.id)
                        } label: {
                            recordRow(record)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                    }
                }
            }

            if let cursor, loadedQuery == listQuery {
                Section {
                    Button("Load More") { Task { await load(listQuery, after: cursor) } }
                        .disabled(loading)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(kind.title)
        .searchable(text: $query, prompt: kind == .notes ? "Search notes" : "Search events")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    selection = .create(day)
                } label: {
                    Label("New \(kind.itemName)", systemImage: "plus")
                }
            }
        }
        .task(id: listQuery) {
            let key = listQuery
            if !key.text.isEmpty {
                try? await Task.sleep(for: .milliseconds(250))
            }
            await load(key)
        }
        .refreshable { await load(listQuery) }
        .sheet(item: $selection) { selection in
            NavigationStack {
                switch selection {
                case .create(let date):
                    OrganiseEditor(kind: kind, service: service, recordID: nil, day: date, onSave: didSave)
                case .edit(let id):
                    OrganiseEditor(kind: kind, service: service, recordID: id, day: day, onSave: didSave)
                case .connected(let record):
                    OrganiseConnectedEvent(record: record)
                }
            }
        }
    }

    private var calendarPicker: some View {
        Section("Week") {
            HStack {
                Button {
                    day = OrganiseDate.addingDays(-7, to: day)
                } label: {
                    Label("Previous week", systemImage: "chevron.left")
                        .labelStyle(.iconOnly)
                        .frame(minWidth: 44, minHeight: 44)
                }
                Spacer()
                DatePicker("Choose a date", selection: $day, displayedComponents: .date)
                    .labelsHidden()
                Spacer()
                Button {
                    day = OrganiseDate.addingDays(7, to: day)
                } label: {
                    Label("Next week", systemImage: "chevron.right")
                        .labelStyle(.iconOnly)
                        .frame(minWidth: 44, minHeight: 44)
                }
            }
            .buttonStyle(.borderless)
            Button("This Week") { day = Date() }
        }
    }

    private func recordRow(_ record: OrganiseRecord) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: kind.icon)
                .foregroundStyle(.tint)
                .frame(width: 34, height: 34)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(record.title).font(.headline)
                if kind == .calendar {
                    Text(record.eventTimeLabel)
                        .font(.subheadline).foregroundStyle(.secondary)
                    if let calendarName = record.calendarName {
                        Text(calendarName).font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    if let preview = record.matchPreview ?? record.preview, !preview.isEmpty {
                        Text(preview).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                    if let checks = record.checkCount, checks > 0 {
                        Text("\(record.doneCount ?? 0) of \(checks) completed")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let updatedAt = record.updatedAt {
                        Text(OrganiseDate.date(updatedAt), format: .dateTime.month().day())
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }

    private var listQuery: ListQuery {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return ListQuery(
            text: text,
            range: kind == .calendar ? OrganiseDate.week(containing: day) : nil
        )
    }

    private var visibleRecords: [OrganiseRecord] {
        guard loadedQuery == listQuery else { return [] }
        guard kind == .calendar else { return records }
        return (records + connected).sorted {
            ($0.eventStart ?? .distantFuture) < ($1.eventStart ?? .distantFuture)
        }
    }

    private var emptyTitle: String {
        if !listQuery.text.isEmpty { return "No Results" }
        return kind == .notes ? "No Notes Yet" : "No Events This Week"
    }

    private var emptyDescription: String {
        if !listQuery.text.isEmpty { return "Try another search." }
        return kind == .notes ? "Create a note or start a checklist." : "Add an event or choose another week."
    }

    private func didSave() {
        let key = listQuery
        Task { await load(key) }
    }

    private func load(_ key: ListQuery, after next: String? = nil) async {
        guard key == listQuery, !Task.isCancelled, next == nil || !loading else { return }
        let request = UUID()
        currentRequest = request
        if loadedQuery != key {
            records = []
            connected = []
            cursor = nil
            feedFailed = false
        }
        loadedQuery = key
        failure = nil
        loading = true
        defer {
            if currentRequest == request { loading = false }
        }
        guard key.text.utf16.count <= 160 else {
            failure = "Search using 160 characters or fewer."
            return
        }
        async let feed = loadConnected(key.range, shouldLoad: next == nil)
        do {
            let page = try await service.list(kind, query: key.text, cursor: next, range: key.range)
            guard currentRequest == request, key == listQuery, !Task.isCancelled else { return }
            if next == nil {
                records = page.records
            } else {
                let known = Set(records.map(\.id))
                records += page.records.filter { !known.contains($0.id) }
            }
            cursor = page.cursor
            if key.range != nil, next == nil {
                let events = await feed
                guard currentRequest == request, key == listQuery, !Task.isCancelled else { return }
                feedFailed = events == nil
                if let events {
                    connected = events.filter { event in
                        key.text.isEmpty
                            || event.title.localizedCaseInsensitiveContains(key.text)
                            || event.description?.localizedCaseInsensitiveContains(key.text) == true
                    }
                }
            }
        } catch {
            guard currentRequest == request, key == listQuery, !Task.isCancelled else { return }
            failure = error.localizedDescription
        }
    }

    private func loadConnected(_ range: OrganiseRange?, shouldLoad: Bool) async -> [OrganiseRecord]? {
        guard let range, shouldLoad else { return nil }
        return try? await service.connectedEvents(in: range)
    }

    private struct ListQuery: Equatable {
        let text: String
        let range: OrganiseRange?
    }

    private enum Selection: Identifiable {
        case create(Date), edit(String), connected(OrganiseRecord)

        var id: String {
            switch self {
            case .create: "new"
            case .edit(let id): id
            case .connected(let record): "calendar-\(record.id)"
            }
        }
    }
}

@MainActor
private struct OrganiseEditor: View {
    let kind: OrganiseKind
    let service: OrganiseService
    let recordID: String?
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: OrganiseDraft?
    @State private var pending: OrganiseSave?
    @State private var failure: String?
    @State private var saving = false

    init(kind: OrganiseKind, service: OrganiseService, recordID: String?, day: Date, onSave: @escaping () -> Void) {
        self.kind = kind
        self.service = service
        self.recordID = recordID
        self.onSave = onSave
        _draft = State(initialValue: recordID == nil ? OrganiseDraft(day: day) : nil)
    }

    var body: some View {
        Form {
            if let draft = Binding<OrganiseDraft>($draft) {
                Group {
                    Section {
                        TextField("Title", text: draft.title)
                    }
                    if kind == .notes {
                        noteFields(draft)
                    } else {
                        eventFields(draft)
                    }
                }
                .disabled(saving)
            } else if failure == nil {
                ProgressView("Opening \(kind.itemName)")
            }
            if let failure {
                Section {
                    Label(failure, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.secondary)
                    if draft == nil {
                        Button("Try Again") { Task { await load() } }
                    }
                }
            }
        }
        .navigationTitle(recordID == nil ? "New \(kind.itemName)" : "Edit \(kind.itemName)")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(saving)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }.disabled(saving)
            }
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView().accessibilityLabel("Saving")
                } else {
                    Button("Save") { Task { await save() } }
                        .disabled(draft?.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false)
                }
            }
        }
        .task { await load() }
    }

    private func noteFields(_ draft: Binding<OrganiseDraft>) -> some View {
        Group {
            Section("Note") {
                TextEditor(text: draft.text)
                    .frame(minHeight: 160)
                    .accessibilityLabel("Note")
            }
            Section("Checklist") {
                ForEach(draft.checklist) { item in
                    HStack {
                        Button {
                            item.done.wrappedValue.toggle()
                        } label: {
                            Label(
                                item.done.wrappedValue ? "Mark incomplete" : "Mark complete",
                                systemImage: item.done.wrappedValue ? "checkmark.circle.fill" : "circle"
                            )
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                        }
                        .buttonStyle(.borderless)
                        TextField("Checklist item", text: item.text, axis: .vertical)
                    }
                }
                .onDelete { offsets in draft.checklist.wrappedValue.remove(atOffsets: offsets) }
                Button("Add Checklist Item", systemImage: "plus") {
                    draft.checklist.wrappedValue.append(OrganiseCheck())
                }
                .disabled(draft.checklist.wrappedValue.count >= 200)
            }
        }
    }

    private func eventFields(_ draft: Binding<OrganiseDraft>) -> some View {
        Group {
            Section("When") {
                Toggle("All Day", isOn: draft.allDay)
                if draft.allDay.wrappedValue {
                    DatePicker("First Day", selection: draft.start, displayedComponents: .date)
                    DatePicker("Last Day", selection: draft.end, displayedComponents: .date)
                } else {
                    DatePicker("Starts", selection: draft.start)
                    DatePicker("Ends", selection: draft.end)
                }
            }
            Section("Description") {
                TextEditor(text: draft.text)
                    .frame(minHeight: 96)
                    .accessibilityLabel("Description")
            }
        }
    }

    private func load() async {
        guard draft == nil, let recordID else { return }
        failure = nil
        do {
            let record = try await service.record(kind, id: recordID)
            try Task.checkCancellation()
            draft = try OrganiseDraft(record: record, kind: kind)
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }

    private func save() async {
        guard let draft, !saving else { return }
        saving = true
        failure = nil
        defer { saving = false }
        do {
            let value = try draft.value(for: kind)
            let operation: OrganiseSave
            if let pending, pending.value == value {
                operation = pending
            } else {
                operation = try OrganiseSave(kind: kind, id: draft.id, version: draft.version, value: value)
                pending = operation
            }
            _ = try await service.save(operation)
            try Task.checkCancellation()
            onSave()
            dismiss()
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }
}

private struct OrganiseDraft {
    let id: String
    let version: Int
    let links: [OrganiseLink]
    let timezone: String
    var title = ""
    var text = ""
    var checklist: [OrganiseCheck] = []
    var allDay = false
    var start: Date
    var end: Date

    init(day: Date) {
        id = OrganiseService.identifier()
        version = 0
        links = []
        timezone = TimeZone.current.identifier
        start = OrganiseDate.calendar.date(bySettingHour: 9, minute: 0, second: 0, of: day) ?? day
        end = start.addingTimeInterval(3_600)
    }

    init(record: OrganiseRecord, kind: OrganiseKind) throws {
        guard let version = record.version, let links = record.links else {
            throw OrganiseDraftIssue("This item couldn’t be opened for editing.")
        }
        id = record.id
        self.version = version
        self.links = links
        timezone = record.timezone ?? TimeZone.current.identifier
        title = record.title
        if kind == .notes {
            guard let text = record.text, let checklist = record.checklist else {
                throw OrganiseDraftIssue("The complete note couldn’t be loaded.")
            }
            self.text = text
            self.checklist = checklist
            start = .now
            end = .now
        } else {
            guard let start = record.eventStart, let end = record.eventEnd,
                  let allDay = record.allDay, let description = record.description else {
                throw OrganiseDraftIssue("The complete event couldn’t be loaded.")
            }
            text = description
            self.allDay = allDay
            self.start = start
            self.end = allDay ? OrganiseDate.addingDays(-1, to: end) : end
        }
    }

    func value(for kind: OrganiseKind) throws -> OrganiseValue {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.utf16.count <= 160 else {
            throw OrganiseDraftIssue("Enter a title of up to 160 characters.")
        }
        if kind == .notes {
            guard text.utf16.count <= 64_000 else {
                throw OrganiseDraftIssue("Notes can contain up to 64,000 characters.")
            }
            guard checklist.count <= 200, checklist.allSatisfy({ $0.text.utf16.count <= 500 }) else {
                throw OrganiseDraftIssue("Use up to 200 checklist items of 500 characters each.")
            }
            return OrganiseValue(title: title, links: links, text: text, checklist: checklist)
        }
        guard text.utf16.count <= 4_000 else {
            throw OrganiseDraftIssue("Event descriptions can contain up to 4,000 characters.")
        }
        var value = OrganiseValue(title: title, links: links, description: text, allDay: allDay, timezone: timezone)
        if allDay {
            let first = OrganiseDate.calendar.startOfDay(for: start)
            let last = OrganiseDate.calendar.startOfDay(for: end)
            guard last >= first, last < OrganiseDate.addingDays(366, to: first) else {
                throw OrganiseDraftIssue("Choose an end day within a year of the first day.")
            }
            value.startDate = OrganiseDate.day(first)
            value.endDate = OrganiseDate.day(OrganiseDate.addingDays(1, to: last))
        } else {
            guard end > start, end.timeIntervalSince(start) <= 31 * 86_400,
                  start.timeIntervalSince1970 >= 0, end.timeIntervalSince1970 <= 4_102_444_800 else {
                throw OrganiseDraftIssue("Choose an end time after the start, within 31 days.")
            }
            value.start = OrganiseDate.stamp(start)
            value.end = OrganiseDate.stamp(end)
        }
        return value
    }
}

private struct OrganiseDraftIssue: LocalizedError {
    let errorDescription: String?

    init(_ message: String) { errorDescription = message }
}

private struct OrganiseConnectedEvent: View {
    let record: OrganiseRecord
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                Text(record.title).font(.headline)
                Text(record.eventTimeLabel)
                if let calendarName = record.calendarName {
                    Label(calendarName, systemImage: "calendar")
                        .foregroundStyle(.secondary)
                }
            }
            if let description = record.description, !description.isEmpty {
                Section("Description") {
                    Text(description).textSelection(.enabled)
                }
            }
        }
        .navigationTitle("Calendar Event")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}

private extension OrganiseRecord {
    var eventTimeLabel: String {
        guard let start = eventStart, let end = eventEnd else { return "Time unavailable" }
        let day = start.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        if allDay == true {
            let last = OrganiseDate.addingDays(-1, to: end)
            if last <= start { return "\(day) · All day" }
            return "\(day) – \(last.formatted(.dateTime.month(.abbreviated).day())) · All day"
        }
        if OrganiseDate.calendar.isDate(start, inSameDayAs: end) {
            return "\(day) · \(start.formatted(.dateTime.hour().minute())) – \(end.formatted(.dateTime.hour().minute()))"
        }
        return "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }
}
