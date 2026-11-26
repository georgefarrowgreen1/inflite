import SwiftUI

@MainActor
struct NativeTodayView: View {
    let user: BackendUser
    let initialToday: BackendToday?
    let preview: Bool
    let captureRevision: Int
    var openAgendaItem: (TodayAgendaDestination) -> Void = { _ in }
    var onAgendaChanged: () -> Void = {}
    let open: (InFliteRoute) -> Void
    let capture: () -> Void
    let onSessionExpired: () -> Void

    @State private var today: BackendToday?
    @State private var loading = false
    @State private var failed = false
    @State private var calendar: [OrganiseRecord] = []
    @State private var reminders: [NativeReminder] = []
    @State private var openedDetail: AgendaDetail?
    @State private var lastRead: Date?
    @State private var lastAgendaRead: Date?
    @State private var refreshedCaptureRevision = 0
    @State private var agendaRead = UUID()
    @State private var refreshingAgenda = false
    @State private var agendaFailed = false
    @State private var reminderRevision = 0
    @State private var reminderAttempt: ReminderAttempt?
    @State private var reminderWorking = false
    @State private var undoReminder: NativeReminder?
    @State private var actionNotice: String?
    @State private var recurringConfirmation: NativeReminder?
    @State private var showingMoreUpcoming = false
    @ObservedObject private var notifications = NativeNotificationStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isInFliteScreenVisible) private var visible
    @Environment(\.dynamicTypeSize) private var textSize

    private struct RefreshKey: Equatable {
        let visible: Bool
        let revision: Int
    }

    private struct ReminderAttempt {
        let record: NativeReminder
        let status: String
        let change: NativeReminderChange
    }

    private struct AgendaDetail: Identifiable {
        let id = UUID()
        let destination: TodayAgendaDestination
        let connectedEvent: OrganiseRecord?
    }

    private var unread: Int { notifications.unread(for: user.id) }

    private var day: BackendToday? { today ?? initialToday }
    private var onScreen: Bool { visible && scenePhase == .active }
    private var upcoming: [TodayAgendaEntry] {
        let fromDay = (day?.upcoming ?? []).enumerated().map {
            TodayAgendaEntry(event: $0.element, index: $0.offset, waiting: false)
        }
        let calendarIDs = Set(calendar.map(\.id))
        let upcomingItems = fromDay.filter {
            if case .calendarEvent(let id)? = $0.destination { return !calendarIDs.contains(id) }
            return true
        } + calendar.map(TodayAgendaEntry.init(calendar:))
        return Array(upcomingItems.sorted { ($0.time ?? .distantFuture) < ($1.time ?? .distantFuture) }.prefix(12))
    }

    private var waiting: [TodayAgendaEntry] {
        let reminderIDs = Set(reminders.map(\.id))
        let fromDay = (day?.waiting ?? []).enumerated().map {
            TodayAgendaEntry(event: $0.element, index: $0.offset, waiting: true)
        }.filter {
            if case .reminder(let id)? = $0.destination { return !reminderIDs.contains(id) }
            return true
        }
        return fromDay + reminders.map(TodayAgendaEntry.init(reminder:))
    }

    private var summary: BackendTodayTop? {
        guard let day else { return nil }
        return day.phase.flatMap { day.tops?[$0] } ?? day.tops?["morning"]
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 17) {
                header
                if let next = upcoming.first {
                    agenda("Coming up", events: showingMoreUpcoming ? upcoming : [next])
                }
                if let summary, let title = summary.title, !title.isEmpty {
                    summaryCard(summary, title: title)
                } else if preview {
                    NativeCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Your day, joined up").font(.title2.bold())
                            Text("A look at your plans and updates for today.").foregroundStyle(.secondary)
                        }
                    }
                }
                if let weather = day?.cards?.weather, let now = weather.now {
                    weatherCard(weather, now: now)
                }
                if !waiting.isEmpty {
                    agenda("Waiting", events: Array(waiting.prefix(18)))
                }
                if agendaFailed {
                    Button("Refresh calendar and reminders", systemImage: "arrow.clockwise") {
                        Task { await refreshAgenda() }
                    }
                    .font(.subheadline)
                    .buttonStyle(.bordered)
                    .disabled(refreshingAgenda)
                }
                if failed {
                    NativeCard {
                        VStack(alignment: .leading, spacing: 9) {
                            Label("Today couldn’t refresh", systemImage: "arrow.clockwise")
                            Button("Try again") { Task { await refresh() } }.buttonStyle(.bordered)
                        }
                    }
                } else if day == nil && !preview {
                    ProgressView("Loading Today").padding(.vertical, 28)
                }
                if !preview, let updatedAt, !loading {
                    Text("Updated \(updatedAt.formatted(.relative(presentation: .named)))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: 590)
            .padding(.horizontal, 16)
            .padding(.top, 7)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity)
        }
        .refreshable {
            async let dayRefresh: Void = refresh()
            async let agendaRefresh: Void = refreshAgenda()
            _ = await (dayRefresh, agendaRefresh)
        }
        .task(id: RefreshKey(visible: onScreen, revision: captureRevision)) {
            guard onScreen, !preview else { return }
            let revision = captureRevision
            let captureChanged = revision != refreshedCaptureRevision
            let refreshDay = day == nil || captureChanged
                || updatedAt.map { Date.now.timeIntervalSince($0) >= 60 } == true
            let refreshDetails = captureChanged
                || lastAgendaRead.map { Date.now.timeIntervalSince($0) >= 60 } != false
            async let agendaRefresh: Void = refreshAgenda(ifNeeded: refreshDetails)
            if refreshDay { await refresh() }
            await notifications.refresh(owner: user.id)
            await agendaRefresh
            if !Task.isCancelled { refreshedCaptureRevision = revision }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let actionNotice, onScreen, openedDetail == nil {
                actionFeedback(actionNotice)
                    .frame(maxWidth: 590)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 5)
            }
        }
        .sheet(item: $openedDetail) { detail in
            content(for: detail).nativeSheetChrome()
        }
        .confirmationDialog("Complete this occurrence?", isPresented: Binding(
            get: { recurringConfirmation != nil }, set: { if !$0 { recurringConfirmation = nil } }
        ), titleVisibility: .visible, presenting: recurringConfirmation) { reminder in
            Button("Complete this occurrence") { Task { await changeReminder(reminder, to: "done") } }
        } message: { _ in
            Text("InFlite will schedule the next occurrence.")
        }
    }

    private var updatedAt: Date? {
        day?.at.flatMap { $0.isFinite && $0 > 0 ? Date(timeIntervalSince1970: $0 / 1000) : nil } ?? lastRead
    }

    private var header: some View {
        HStack(spacing: 9) {
            Image("InFliteMark").resizable().scaledToFit()
                .frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 11))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Today").font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("native-today")
                Text(Date.now, format: .dateTime.weekday(.wide).day().month(.wide))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            Button(action: capture) {
                Image(systemName: "plus").font(.headline)
                    .frame(width: 45, height: 45)
                    .background(.regularMaterial, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quick Capture")
            Menu {
                Button(unread > 0 ? "Notifications (\(unread))" : "Notifications", systemImage: "bell") { open(.notifications) }
                Button("Settings", systemImage: "gearshape") { open(.account) }
            } label: {
                Text(String(user.name.prefix(1)).uppercased())
                    .font(.headline)
                    .frame(width: 45, height: 45)
                    .background(NativeStyle.accent.opacity(0.20), in: .circle)
                    .overlay(alignment: .topTrailing) {
                        NativeNotificationBadge(count: unread).offset(x: 5, y: -5)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Account")
            .accessibilityValue(unread == 0 ? "No unread notifications" : "\(unread) unread notifications")
        }
        .padding(.bottom, 8)
    }

    private func summaryCard(_ summary: BackendTodayTop, title: String) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 15) {
                if let chip = summary.chip, !chip.isEmpty {
                    Text(chip).font(.caption.weight(.semibold))
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(.primary.opacity(0.08), in: .capsule)
                }
                Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                if let stats = summary.stats, !stats.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 19) {
                            ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(stat.label ?? "").font(.caption).foregroundStyle(.secondary)
                                    Text(stat.value ?? "").font(.headline)
                                }
                            }
                        }
                        .padding(12)
                    }
                    .scrollIndicators(.hidden)
                    .background(.primary.opacity(0.05), in: .rect(cornerRadius: 14))
                }
                ForEach(Array((summary.lines ?? []).enumerated()), id: \.offset) { _, line in
                    Text(line).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func weatherCard(_ weather: BackendWeatherCard, now: BackendWeatherNow) -> some View {
        Button { open(.weather) } label: {
            NativeCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        NativeAppIcon(route: .weather, size: 28)
                        Text("Weather").font(.headline)
                        if let place = weather.place?.name { Text(place).font(.subheadline).foregroundStyle(.secondary) }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 12) {
                        if let temperature = now.temp {
                            Text(temperature).font(.system(size: 43, weight: .light, design: .rounded))
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            if let label = now.label { Text(label).font(.headline) }
                            if let high = weather.day?.hi, let low = weather.day?.lo {
                                Text("H \(high) · L \(low)").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if let lead = weather.lead { Text(lead).foregroundStyle(.secondary) }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func agenda(_ title: String, events: [TodayAgendaEntry]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            NativeCard {
                VStack(spacing: 12) {
                    ForEach(events) { event in
                        if event.id != events.first?.id { Divider() }
                        agendaRow(event)
                    }
                    if title == "Coming up", upcoming.count > 1 {
                        Button(showingMoreUpcoming ? "Show less" : "Show \(upcoming.count - 1) more") {
                            showingMoreUpcoming.toggle()
                        }
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func agendaRow(_ event: TodayAgendaEntry) -> some View {
        HStack(spacing: 8) {
            if let destination = event.destination {
                Button {
                    switch destination {
                    case .calendarEvent, .reminder:
                        openedDetail = .init(destination: destination, connectedEvent: event.connectedEvent)
                    case .app(let route):
                        open(route)
                    default:
                        openAgendaItem(destination)
                    }
                } label: {
                    agendaLabel(event)
                }
                .buttonStyle(.plain)
            } else {
                agendaLabel(event)
            }
            if let reminder = event.reminder {
                Button {
                    if reminder.recurrence != nil { recurringConfirmation = reminder }
                    else { Task { await changeReminder(reminder, to: "done") } }
                } label: {
                    Image(systemName: "checkmark.circle")
                        .font(.title3)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Complete \(reminder.title)")
                .disabled(reminderWorking)
            }
        }
    }

    private func agendaLabel(_ event: TodayAgendaEntry) -> some View {
        HStack(spacing: 11) {
            if let route = event.destination?.route {
                NativeAppIcon(route: route, size: 29)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title).font(.subheadline.weight(.semibold))
                if let subtitle = eventSubtitle(event) {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if event.destination != nil {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .frame(minHeight: 44)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func eventSubtitle(_ event: TodayAgendaEntry) -> String? {
        let time: String?
        if let date = event.time {
            if event.allDay {
                time = Calendar.current.isDateInToday(date) ? "All day"
                    : "\(date.formatted(.dateTime.weekday(.abbreviated).month().day())) · All day"
            } else {
                time = Calendar.current.isDateInToday(date) ? date.formatted(date: .omitted, time: .shortened)
                    : date.formatted(.dateTime.weekday(.abbreviated).month().day().hour().minute())
            }
        } else {
            time = nil
        }
        let parts = [time, event.detail].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func content(for detail: AgendaDetail) -> some View {
        switch detail.destination {
        case .calendarEvent(let id):
            NavigationStack {
                if let record = detail.connectedEvent {
                    OrganiseConnectedEvent(record: record)
                } else {
                    OrganiseEditor(kind: .calendar, service: OrganiseService(owner: user.id), recordID: id, day: .now) {
                        Task { await refreshAgenda() }
                    }
                }
            }
        case .reminder(let id):
            NativeReminderEditor(owner: user.id, id: id, onChanged: onAgendaChanged)
        default:
            EmptyView()
        }
    }

    private func actionFeedback(_ message: String) -> some View {
        let layout = textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 8))
        return NativeCard {
            layout {
                Text(message).font(.subheadline)
                if !textSize.isAccessibilitySize { Spacer(minLength: 4) }
                actionFeedbackControls
            }
        }
    }

    private var actionFeedbackControls: some View {
        HStack(spacing: 8) {
            if reminderWorking {
                ProgressView().accessibilityLabel("Updating reminder")
            } else if let reminderAttempt {
                Button("Retry") { Task { await changeReminder(reminderAttempt.record, to: reminderAttempt.status) } }
                    .buttonStyle(.bordered)
            } else if let undoReminder {
                Button("Undo") { Task { await changeReminder(undoReminder, to: "open") } }
                    .buttonStyle(.bordered)
            }
            Button {
                undoReminder = nil
                reminderAttempt = nil
                actionNotice = nil
            } label: {
                Image(systemName: "xmark")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Dismiss reminder status")
            .disabled(reminderWorking)
        }
    }

    private func refreshAgenda(ifNeeded: Bool = true, afterConflict: Bool = false) async {
        guard ifNeeded, !preview, onScreen else { return }
        let request = UUID()
        let revision = reminderRevision
        agendaRead = request
        refreshingAgenda = true
        defer { if agendaRead == request { refreshingAgenda = false } }
        do {
            let next = try await TodayAgendaService(owner: user.id).load()
            guard !Task.isCancelled, agendaRead == request, onScreen else { return }
            if let events = next.events { calendar = events }
            if let updates = next.reminders, revision == reminderRevision, !reminderWorking || afterConflict {
                reminders = updates
            }
            agendaFailed = next.events == nil || next.reminders == nil
            if !agendaFailed { lastAgendaRead = .now }
        } catch {
            guard !Task.isCancelled, agendaRead == request, onScreen else { return }
            agendaFailed = true
        }
    }

    private func changeReminder(_ reminder: NativeReminder, to status: String) async {
        guard !preview, onScreen, !reminderWorking else { return }
        reminderWorking = true
        reminderRevision += 1
        defer { reminderWorking = false }
        do {
            let change: NativeReminderChange
            if let attempt = reminderAttempt, attempt.record.id == reminder.id,
               attempt.record.version == reminder.version, attempt.status == status {
                change = attempt.change
            } else {
                change = try NativeReminderChange(record: reminder, status: status)
                reminderAttempt = .init(record: reminder, status: status, change: change)
            }
            actionNotice = status == "done" ? "Completing reminder…" : "Reopening reminder…"
            let result = try await NativeReminderService(owner: user.id).write(change, record: reminder)
            guard !Task.isCancelled else { return }
            reminders.removeAll { $0.id == result.id }
            if result.status == "open", (result.dueAt.map(OrganiseDate.date) ?? .distantPast) <= Date.now.addingTimeInterval(172_800) {
                reminders.append(result)
                reminders.sort { ($0.dueAt ?? .max) < ($1.dueAt ?? .max) }
            }
            reminderAttempt = nil
            if result.version != reminder.version + 1 {
                undoReminder = nil
                actionNotice = "Reminder updated on another device."
            } else if status == "open" {
                undoReminder = nil
                actionNotice = "Reminder reopened."
            } else if result.recurrence != nil {
                undoReminder = nil
                actionNotice = "Next occurrence scheduled."
            } else {
                undoReminder = result.status == "done" ? result : nil
                actionNotice = "Reminder completed."
            }
            onAgendaChanged()
        } catch let error as BackendError {
            if Task.isCancelled { return }
            if case .http(let code, _) = error, code == 404 || code == 409 || code == 410 {
                reminderAttempt = nil
                undoReminder = nil
                actionNotice = "This reminder changed. Review it before trying again."
                await refreshAgenda(afterConflict: true)
            } else {
                actionNotice = "Couldn’t update this reminder."
            }
        } catch {
            if !Task.isCancelled { actionNotice = "Couldn’t update this reminder." }
        }
    }

    @MainActor
    private func refresh() async {
        guard !preview, onScreen, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let next = try await BackendClient.shared.today(owner: user.id)
            guard !Task.isCancelled else { return }
            today = next
            lastRead = .now
            failed = false
        } catch let error as BackendError where error.isAuthenticationRequired {
            if !Task.isCancelled { onSessionExpired() }
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}
