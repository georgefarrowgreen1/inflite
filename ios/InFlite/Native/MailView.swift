import SwiftUI

@MainActor
struct NativeMailView: View {
    let owner: String
    var active = true

    private struct Selection: Equatable {
        var lens: MailLens = .people
        var search = ""
    }

    private struct LoadRequest: Equatable {
        let owner: String
        let active: Bool
        let selection: Selection
        let revision: Int
    }

    private enum Sheet: Identifiable {
        case conversation(MailConversation)
        case draft(MailBrief)
        case compose
        case verify
        case security
        case settings
        case snooze(MailConversation)

        var id: String {
            switch self {
            case .conversation(let thread): "thread:\(thread.id)"
            case .draft(let message): "draft:\(message.id)"
            case .compose: "compose"
            case .verify: "verify"
            case .security: "security"
            case .settings: "settings"
            case .snooze(let thread): "snooze:\(thread.id)"
            }
        }
    }

    @State private var selection = Selection()
    @State private var searchText = ""
    @State private var showingSearch = false
    @State private var access: MailAccess?
    @State private var threads: [MailConversation] = []
    @State private var drafts: [MailBrief] = []
    @State private var hasMore = false
    @State private var loading = true
    @State private var loadingMore = false
    @State private var nextLater: String?
    @State private var acting = false
    @State private var problem: String?
    @State private var sheet: Sheet?
    @State private var reload = 0
    @State private var generation = UUID()
    @Environment(\.scenePhase) private var scenePhase

    private var service: MailService { MailService(owner: owner) }
    private var visible: Bool { active && scenePhase == .active }

    var body: some View {
        VStack(spacing: 16) {
            header
            if access == .ok {
                if showingSearch { searchField }
                if MailLens.primary.contains(selection.lens) {
                    Picker("Mailbox", selection: $selection.lens) {
                        ForEach(MailLens.primary) { lens in
                            Text(lens.title).tag(lens)
                        }
                    }
                    .pickerStyle(.segmented)
                } else {
                    HStack {
                        Text(selection.lens.title).font(.headline)
                        Spacer()
                        Button("Back to People") { selection.lens = .people }
                            .font(.subheadline)
                    }
                }
            }
            mailbox
        }
        .padding(.horizontal, 16)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: LoadRequest(owner: owner, active: visible, selection: selection, revision: reload)) {
            if visible {
                await load()
            } else {
                generation = UUID()
            }
        }
        .sheet(item: $sheet, onDismiss: { reload += 1 }) { sheet in
            switch sheet {
            case .conversation(let thread):
                MailReader(service: service, subject: thread.subject, conversation: thread)
            case .draft(let draft):
                MailComposer(service: service, source: .draft(draft.id))
            case .compose:
                MailComposer(service: service)
            case .verify:
                BackendSignInView(client: .shared, purpose: .mail(owner: owner)) { _ in
                    self.sheet = nil
                }
            case .security:
                NavigationStack {
                    NativeAccountSecurityView(owner: owner)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Close") { self.sheet = nil }
                            }
                        }
                }
            case .settings:
                MailSettingsView(owner: owner)
            case .snooze(let thread):
                MailSnooze { date in
                    try await service.act(.snooze, on: thread.id, until: date)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("Mail")
                .font(.largeTitle.bold())
            Spacer()
            if access == .ok {
                Menu {
                    ForEach(MailLens.allCases.filter { !MailLens.primary.contains($0) }) { lens in
                        Button(lens.title) {
                            searchText = ""
                            selection = Selection(lens: lens)
                        }
                    }
                    Divider()
                    Button("Mail Settings") { sheet = .settings }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("More mailboxes")

                Button {
                    showingSearch.toggle()
                    if !showingSearch {
                        searchText = ""
                        selection.search = ""
                    }
                } label: {
                    Image(systemName: showingSearch ? "xmark" : "magnifyingglass")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel(showingSearch ? "Close search" : "Search Mail")

                Button {
                    sheet = .compose
                } label: {
                    Image(systemName: "square.and.pencil")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Compose")
            }
        }
        .padding(.top, 8)
    }

    private var searchField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Search Mail", text: $searchText)
                    .submitLabel(.search)
                    .onSubmit(runSearch)
                Button("Search", action: runSearch)
                    .font(.subheadline.weight(.semibold))
                    .disabled(searchQuery.utf16.count > 300)
            }
            if searchQuery.utf16.count > 300 {
                Text("Use up to 300 characters.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: .rect(cornerRadius: 18))
        .privacySensitive()
    }

    private var searchQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func runSearch() {
        guard searchQuery.utf16.count <= 300 else { return }
        selection.search = searchQuery
    }

    @ViewBuilder
    private var mailbox: some View {
        if loading {
            ProgressView("Loading Mail")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let access, access != .ok {
            ContentUnavailableView {
                Label(access.title, systemImage: "lock")
            } description: {
                Text(access.message)
            } actions: {
                if access == .passkey {
                    Button("Set up a passkey") { sheet = .security }
                        .buttonStyle(.borderedProminent)
                } else if access == .reauth || access == .signin {
                    Button("Verify identity") { sheet = .verify }
                        .buttonStyle(.borderedProminent)
                }
            }
        } else if let problem, threads.isEmpty, drafts.isEmpty {
            ContentUnavailableView {
                Label("Couldn’t load Mail", systemImage: "exclamationmark.circle")
            } description: {
                Text(problem)
            } actions: {
                Button("Try again") { reload += 1 }
                    .buttonStyle(.bordered)
            }
        } else if threads.isEmpty && drafts.isEmpty {
            ScrollView {
                Text(selection.search.isEmpty ? selection.lens.emptyText : "No matching conversations")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 44)
            }
            .refreshable { await load() }
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 9) {
                    if !drafts.isEmpty {
                        Text("Drafts")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(drafts) { draft in
                        mailRow(title: draft.subject.isEmpty ? "Untitled draft" : draft.subject,
                                subtitle: draft.snippet, date: draft.date, unread: false,
                                hasAttachments: draft.hasAttachments) {
                            sheet = .draft(draft)
                        }
                    }
                    ForEach(threads) { thread in
                        let sender = thread.from?.label
                        mailRow(title: thread.subject,
                                subtitle: [sender, thread.latest?.snippet].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n"),
                                date: thread.date, unread: thread.unread > 0, hasAttachments: thread.hasAttachments) {
                            sheet = .conversation(thread)
                        }
                        .contextMenu {
                            conversationActions(thread)
                        }
                    }
                    if let problem { Text(problem).font(.footnote).foregroundStyle(.secondary) }
                    if hasMore {
                        if loadingMore {
                            ProgressView()
                                .padding(12)
                        } else {
                            Button("Load more") { Task { await loadMore() } }
                                .buttonStyle(.bordered)
                                .padding(8)
                        }
                    }
                }
                .padding(.bottom, 12)
            }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private func conversationActions(_ thread: MailConversation) -> some View {
        if thread.trashed == true {
            actionButton("Restore", icon: "arrow.uturn.backward", action: .restore, thread: thread)
        } else {
            actionButton(thread.done == true ? "Move to Inbox" : "Mark Done", icon: "checkmark.circle",
                         action: thread.done == true ? .inbox : .done, thread: thread)
            actionButton(thread.unread > 0 ? "Mark as Read" : "Mark as Unread", icon: "envelope",
                         action: thread.unread > 0 ? .read : .unread, thread: thread)
            actionButton(thread.starred == true ? "Remove Flag" : "Flag", icon: "flag",
                         action: thread.starred == true ? .unflag : .flag, thread: thread)
            Button {
                sheet = .snooze(thread)
            } label: {
                Label(thread.snoozeUntil == nil ? "Remind Me Later" : "Change Reminder", systemImage: "clock")
            }
            .disabled(acting)
            if thread.snoozeUntil != nil {
                actionButton("Move to Inbox Now", icon: "tray", action: .unsnooze, thread: thread)
            }
            actionButton("Move to Trash", icon: "trash", action: .trash, thread: thread, role: .destructive)
        }
    }

    private func actionButton(_ title: String, icon: String, action: MailThreadAction, thread: MailConversation,
                              role: ButtonRole? = nil) -> some View {
        Button(role: role) {
            Task { await apply(action, to: thread) }
        } label: {
            Label(title, systemImage: icon)
        }
        .disabled(acting)
    }

    private func apply(_ action: MailThreadAction, to thread: MailConversation) async {
        guard !acting else { return }
        acting = true
        defer { acting = false }
        do {
            try await service.act(action, on: thread.id)
            await load()
        } catch {
            if let gate = try? await service.access(), gate != .ok {
                access = gate
                threads = []
                drafts = []
                hasMore = false
                nextLater = nil
            } else if !Task.isCancelled {
                problem = "Couldn’t update the conversation. Try again."
            }
        }
    }

    private func mailRow(title: String, subtitle: String, date: Int64, unread: Bool, hasAttachments: Bool,
                         open: @escaping () -> Void) -> some View {
        Button(action: open) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: unread ? "circle.fill" : "circle")
                    .font(.system(size: 8))
                    .foregroundStyle(unread ? Color.accentColor : Color.clear)
                    .padding(.top, 6)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(verbatim: title)
                            .font(.subheadline.weight(unread ? .bold : .semibold))
                            .lineLimit(2)
                        Spacer(minLength: 8)
                        Text(mailDate(date), style: .relative)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if !subtitle.isEmpty {
                        Text(verbatim: subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                if hasAttachments {
                    Image(systemName: "paperclip")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Has attachments")
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: .rect(cornerRadius: 18))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .privacySensitive()
        .accessibilityHint(unread ? "Unread" : "")
    }

    private func load() async {
        let requestID = UUID()
        generation = requestID
        let filter = selection
        loading = true
        loadingMore = false
        problem = nil
        threads = []
        drafts = []
        hasMore = false
        nextLater = nil
        do {
            let access = try await service.access()
            guard !Task.isCancelled, generation == requestID else { return }
            self.access = access
            guard access == .ok else {
                loading = false
                return
            }
            let page = try await service.conversations(filter.lens, search: filter.search)
            guard !Task.isCancelled, generation == requestID else { return }
            threads = page.threads
            drafts = page.drafts
            nextLater = page.nextLater
            hasMore = page.hasMore && !page.threads.isEmpty &&
                (filter.lens != .later || !filter.search.isEmpty || page.nextLater != nil)
        } catch {
            guard !Task.isCancelled, generation == requestID else { return }
            if let gate = try? await service.access(), gate != .ok {
                guard !Task.isCancelled, generation == requestID else { return }
                access = gate
            } else {
                guard !Task.isCancelled, generation == requestID else { return }
                access = nil
                problem = "Check your connection and try again."
            }
        }
        loading = false
    }

    private func loadMore() async {
        guard !loading, !loadingMore, hasMore, let before = threads.last?.sort else { return }
        let requestID = generation
        let filter = selection
        let usesWakeCursor = filter.lens == .later && filter.search.isEmpty
        let wakeCursor = nextLater
        guard !usesWakeCursor || wakeCursor != nil else { return }
        loadingMore = true
        problem = nil
        do {
            let page = try await service.conversations(
                filter.lens, search: filter.search, before: usesWakeCursor ? nil : before,
                later: usesWakeCursor ? wakeCursor : nil
            )
            guard generation == requestID else { return }
            let existing = Set(threads.map(\.id))
            let next = page.threads.filter { !existing.contains($0.id) }
            threads += next
            nextLater = page.nextLater
            let advanced = usesWakeCursor ? page.nextLater != nil && page.nextLater != wakeCursor : threads.last?.sort != before
            hasMore = page.hasMore && !next.isEmpty && advanced
        } catch {
            guard generation == requestID else { return }
            if let gate = try? await service.access(), gate != .ok {
                guard generation == requestID else { return }
                threads = []
                drafts = []
                hasMore = false
                nextLater = nil
                access = gate
            } else {
                guard generation == requestID else { return }
                problem = "Couldn’t load more conversations. Try again."
            }
        }
        loadingMore = false
    }
}

private func mailDate(_ milliseconds: Int64) -> Date {
    Date(timeIntervalSince1970: Double(milliseconds) / 1000)
}

@MainActor
private struct MailSnooze: View {
    let save: (Date) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now.addingTimeInterval(3600)
    @State private var busy = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Bring back", selection: $date, in: Date.now...)
                    .disabled(busy)
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("Remind Me Later")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(busy)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await confirm() } }
                        .disabled(busy || date <= .now)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func confirm() async {
        guard !busy, date > .now else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            try await save(date)
            dismiss()
        } catch {
            if !Task.isCancelled { issue = error.localizedDescription }
        }
    }
}

@MainActor
private struct MailReader: View {
    let service: MailService
    let subject: String
    let conversation: MailConversation

    @Environment(\.dismiss) private var dismiss
    @State private var messages: [MailBrief] = []
    @State private var selectedID: String?
    @State private var message: MailMessage?
    @State private var rendered = AttributedString()
    @State private var showCompleteBody = false
    @State private var cursor: String?
    @State private var loadingThread = true
    @State private var loadingMessage = false
    @State private var loadingOlder = false
    @State private var issue: String?
    @State private var response: MailReplyKind?
    @State private var markedRead = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(verbatim: subject.isEmpty ? "Untitled message" : subject)
                        .font(.title2.bold())
                        .privacySensitive()
                    if messages.count > 1 || cursor != nil {
                        Menu {
                            ForEach(messages) { item in
                                Button {
                                    selectedID = item.id
                                } label: {
                                    Text("\(item.from.label) · \(mailDate(item.date).formatted(date: .abbreviated, time: .shortened))")
                                }
                            }
                            if cursor != nil {
                                Button("Load older messages") { Task { await older() } }
                                    .disabled(loadingOlder)
                            }
                        } label: {
                            Label("Messages in this conversation", systemImage: "chevron.up.chevron.down")
                                .font(.subheadline)
                        }
                    }
                    if loadingThread || loadingMessage {
                        ProgressView("Opening message")
                            .padding(.vertical, 20)
                    }
                    if let message {
                        content(message)
                    }
                    if let issue {
                        Text(issue)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Button("Try again") {
                            Task {
                                if let selectedID { await loadMessage(selectedID) }
                                else { await loadThread() }
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    if message != nil, conversation.trashed != true {
                        Menu {
                            replyButton(.reply)
                            replyButton(.all)
                            replyButton(.forward)
                        } label: {
                            Label("Respond", systemImage: "arrowshape.turn.up.left")
                        }
                    }
                }
            }
            .task { await loadThread() }
            .task(id: selectedID) { if let selectedID { await loadMessage(selectedID) } }
            .sheet(item: $response) { kind in
                if let message {
                    MailComposer(service: service, source: .responding(message, kind))
                }
            }
        }
    }

    private func replyButton(_ kind: MailReplyKind) -> some View {
        Button {
            response = kind
        } label: {
            Label(kind.title, systemImage: kind.symbol)
        }
    }

    private func content(_ message: MailMessage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: message.from.label)
                    .font(.headline)
                if !message.from.email.isEmpty && message.from.email != message.from.label {
                    Text(verbatim: message.from.email)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Text(mailDate(message.date).formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !message.to.isEmpty || !message.cc.isEmpty {
                    DisclosureGroup("Recipients") {
                        if !message.to.isEmpty {
                            LabeledContent("To", value: message.to.map(\.label).joined(separator: ", "))
                        }
                        if !message.cc.isEmpty {
                            LabeledContent("Cc", value: message.cc.map(\.label).joined(separator: ", "))
                        }
                    }
                    .font(.subheadline)
                }
            }
            Divider()
            if rendered.characters.allSatisfy(\.isWhitespace) {
                Text("This message has no readable text.")
                    .foregroundStyle(.secondary)
            } else {
                let length = rendered.characters.count
                let limit = showCompleteBody ? length : min(length, 60_000)
                Text(AttributedString(rendered[rendered.startIndex..<rendered.characters.index(rendered.startIndex, offsetBy: limit)]))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !showCompleteBody, length > limit {
                    Button("Show full message") { showCompleteBody = true }
                        .buttonStyle(.bordered)
                }
            }
            if let images = message.inlineAttachments, !images.isEmpty {
                Text("Inline images")
                    .font(.subheadline.weight(.semibold))
                MailAttachments(files: images, service: service)
                    .id(message.id)
            }
            if !message.attachments.isEmpty {
                Text("Attachments")
                    .font(.subheadline.weight(.semibold))
                MailAttachments(files: message.attachments, service: service)
                    .id(message.id)
            }
        }
        .padding(16)
        .background(.regularMaterial, in: .rect(cornerRadius: 20))
        .privacySensitive()
    }

    private func loadThread() async {
        loadingThread = true
        issue = nil
        do {
            let page = try await service.thread(conversation.id)
            try Task.checkCancellation()
            messages = page.messages
            cursor = page.nextAfter
            selectedID = page.messages.first?.id
        } catch is CancellationError { return }
        catch {
            guard !Task.isCancelled else { return }
            issue = "Couldn’t open this conversation."
        }
        loadingThread = false
    }

    private func older() async {
        guard let cursor, !loadingOlder else { return }
        loadingOlder = true
        defer { loadingOlder = false }
        do {
            let page = try await service.thread(conversation.id, after: cursor)
            let known = Set(messages.map(\.id))
            messages += page.messages.filter { !known.contains($0.id) }
            self.cursor = page.nextAfter
        } catch {
            issue = "Couldn’t load older messages."
        }
    }

    private func loadMessage(_ id: String) async {
        loadingMessage = true
        issue = nil
        message = nil
        showCompleteBody = false
        do {
            let content = try await service.message(id)
            try Task.checkCancellation()
            guard selectedID == id else { return }
            rendered = NativeMailBody.readable(content)
            message = content
            loadingMessage = false
            if conversation.unread > 0, !markedRead {
                markedRead = true
                try? await service.act(.read, on: conversation.id)
            }
        } catch {
            guard !Task.isCancelled, selectedID == id else { return }
            issue = "Couldn’t load this message. Mail may need you to verify your identity again."
        }
        if selectedID == id { loadingMessage = false }
    }
}
