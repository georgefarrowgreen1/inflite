import SwiftUI
import WebKit

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
        case web

        var id: String {
            switch self {
            case .conversation(let thread): "thread:\(thread.id)"
            case .draft(let message): "draft:\(message.id)"
            case .compose: "compose"
            case .verify: "verify"
            case .web: "web"
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
                Picker("Mailbox", selection: $selection.lens) {
                    ForEach(MailLens.allCases) { lens in
                        Text(lens.title).tag(lens)
                    }
                }
                .pickerStyle(.segmented)
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
                MailReader(service: service, subject: draft.subject, draft: draft)
            case .compose:
                MailComposer(service: service)
            case .verify:
                BackendSignInView(client: .shared, purpose: .mail(owner: owner)) { _ in
                    self.sheet = nil
                }
            case .web:
                MailWebView()
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("Mail")
                .font(.largeTitle.bold())
            Spacer()
            if access == .ok {
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
                    Button("Open Mail") { sheet = .web }
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
                    }
                    if let problem { Text(problem).font(.footnote).foregroundStyle(.secondary) }
                    if hasMore {
                        if selection.lens == .later, selection.search.isEmpty {
                            // Later is sorted by wake time, while the backend's list cursor is a message date.
                            Button("See more in Mail") { sheet = .web }
                                .buttonStyle(.bordered)
                                .padding(8)
                        } else if loadingMore {
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
            hasMore = page.hasMore && !page.threads.isEmpty
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
        loadingMore = true
        problem = nil
        do {
            let page = try await service.conversations(filter.lens, search: filter.search, before: before)
            guard generation == requestID else { return }
            let existing = Set(threads.map(\.id))
            let next = page.threads.filter { !existing.contains($0.id) }
            threads += next
            hasMore = page.hasMore && !next.isEmpty && threads.last?.sort != before
        } catch {
            guard generation == requestID else { return }
            if let gate = try? await service.access(), gate != .ok {
                guard generation == requestID else { return }
                threads = []
                drafts = []
                hasMore = false
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
private struct MailReader: View {
    let service: MailService
    let subject: String
    var conversation: MailConversation? = nil
    var draft: MailBrief? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var messages: [MailBrief] = []
    @State private var selectedID: String?
    @State private var message: MailMessage?
    @State private var cursor: String?
    @State private var loadingThread = true
    @State private var loadingMessage = false
    @State private var loadingOlder = false
    @State private var issue: String?
    @State private var showingWeb = false
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
                    Button("Open in Mail") { showingWeb = true }
                        .buttonStyle(.bordered)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle(draft == nil ? "Conversation" : "Draft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await loadThread() }
            .task(id: selectedID) { if let selectedID { await loadMessage(selectedID) } }
            .sheet(isPresented: $showingWeb) { MailWebView() }
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
            }
            Divider()
            if message.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("This message has no plain-text body.")
                    .foregroundStyle(.secondary)
            } else {
                Text(verbatim: String(message.text.prefix(60_000)))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if message.text.count > 60_000 {
                    Text("Open Mail to read the rest of this message.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(message.attachments) { file in
                Label {
                    VStack(alignment: .leading) {
                        Text(verbatim: file.filename)
                        Text(ByteCountFormatter.string(fromByteCount: file.size, countStyle: .file))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: { Image(systemName: "paperclip") }
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
            if let conversation {
                let page = try await service.thread(conversation.id)
                try Task.checkCancellation()
                messages = page.messages
                cursor = page.nextAfter
                selectedID = page.messages.first?.id
            } else {
                selectedID = draft?.id
            }
        } catch is CancellationError { return }
        catch {
            guard !Task.isCancelled else { return }
            issue = "Couldn’t open this conversation."
        }
        loadingThread = false
    }

    private func older() async {
        guard let conversation, let cursor, !loadingOlder else { return }
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
        do {
            let content = try await service.message(id)
            try Task.checkCancellation()
            guard selectedID == id else { return }
            message = content
            loadingMessage = false
            if let conversation, conversation.unread > 0, !markedRead {
                markedRead = true
                try? await service.markRead(conversation.id)
            }
        } catch {
            guard !Task.isCancelled, selectedID == id else { return }
            issue = "Couldn’t load this message. Mail may need you to verify your identity again."
        }
        if selectedID == id { loadingMessage = false }
    }
}

@MainActor
private struct MailComposer: View {
    let service: MailService

    @Environment(\.dismiss) private var dismiss
    @State private var from: String?
    @State private var to = ""
    @State private var subject = ""
    @State private var text = ""
    @State private var draftID = UUID().uuidString
    @State private var sendKey = UUID().uuidString
    @State private var busy = false
    @State private var sendPending = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                if let from {
                    Section {
                        LabeledContent("From", value: from)
                        TextField("To", text: $to, prompt: Text("Email addresses, separated by commas"))
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Subject", text: $subject)
                    }
                    .disabled(busy || sendPending)
                    Section("Message") {
                        TextEditor(text: $text)
                            .frame(minHeight: 155)
                            .accessibilityLabel("Message")
                            .disabled(busy || sendPending)
                    }
                    if !sendPending {
                        Button("Save draft") { Task { await save(thenSend: false) } }
                            .disabled(busy)
                    }
                } else if issue == nil {
                    ProgressView("Loading your Mail address")
                } else {
                    Button("Try again") { Task { await loadAddress() } }
                        .disabled(busy)
                }
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
                if busy { ProgressView() }
            }
            .privacySensitive()
            .interactiveDismissDisabled(busy)
            .navigationTitle("New message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sendPending ? "Retry send" : "Send") { Task { await save(thenSend: true) } }
                        .disabled(busy || from == nil)
                }
            }
            .task { await loadAddress() }
        }
    }

    private func loadAddress() async {
        guard !busy else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            from = try await service.fromAddress()
        } catch {
            if !Task.isCancelled { issue = "Couldn’t load your Mail address. Open Mail and verify your identity." }
        }
    }

    private func save(thenSend: Bool) async {
        guard let from, !busy else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            if !sendPending {
                let recipients = to.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                if thenSend && (recipients.isEmpty || recipients.count > 50 || recipients.contains(where: {
                    $0.range(of: #"^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$"#, options: .regularExpression) == nil
                })) {
                    throw MailServiceError.invalidRecipient
                }
                draftID = try await service.saveDraft(id: draftID, from: from, recipients: recipients, subject: subject, text: text)
            }
            if thenSend {
                // Keep the saved draft and key fixed once a send might have reached Mail.
                sendPending = true
                try await service.send(draft: draftID, key: sendKey)
            }
            dismiss()
        } catch let BackendError.http(status, message) where sendPending && [400, 413].contains(status) {
            sendPending = false
            sendKey = UUID().uuidString
            issue = message ?? "Check the recipients and message before sending again."
        } catch let error as MailServiceError {
            issue = error.localizedDescription
        } catch {
            issue = sendPending
                ? "Couldn’t confirm delivery. Retry send to check the same message."
                : "Couldn’t save the draft. Check your connection and try again."
        }
    }
}

@MainActor
private struct MailWebView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var browser = BrowserSession(persistent: false)

    var body: some View {
        NavigationStack {
            ZStack {
                WebSurface(webView: browser.webView)
                    .opacity(browser.phase == .ready ? 1 : 0)
                    .accessibilityHidden(browser.phase != .ready)
                switch browser.phase {
                case .opening:
                    ProgressView("Opening Mail")
                case .ready:
                    EmptyView()
                case .unavailable(let problem):
                    ContentUnavailableView {
                        Label(problem.title, systemImage: "exclamationmark.circle")
                    } description: {
                        Text(problem.message)
                    } actions: {
                        Button("Try again") { browser.retry() }
                            .buttonStyle(.bordered)
                    }
                }
            }
            .navigationTitle("Mail")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { browser.open(.mail) }
            .sheet(item: $browser.sharedDownload, onDismiss: browser.clearSharedDownload) { download in
                DownloadShareSheet(file: download.file)
            }
        }
    }
}
