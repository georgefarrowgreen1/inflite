import AVFoundation
import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct NativeChatsView: View {
    let owner: String
    let active: Bool

    @State private var service: ChatService
    @State private var overview: ChatOverview?
    @State private var selected: ChatThread?
    @State private var sheet: Sheet?
    @State private var password = ""
    @State private var search = ""
    @State private var working = false
    @State private var issue: String?
    @Environment(\.scenePhase) private var scenePhase

    private enum Sheet: String, Identifiable {
        case compose, requests
        var id: String { rawValue }
    }

    init(owner: String, active: Bool) {
        self.owner = owner
        self.active = active
        _service = State(initialValue: ChatService(owner: owner))
    }

    private var onScreen: Bool { active && scenePhase == .active }
    private var polling: Bool { onScreen && overview != nil && selected == nil && sheet == nil }

    var body: some View {
        Group {
            if let overview {
                conversations(overview)
                    .searchable(text: $search, prompt: "Search conversations")
            } else {
                unlockView
            }
        }
        .navigationTitle("Chats")
        .toolbar {
            if let overview {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        Button("Friend requests", systemImage: "person.badge.plus") { sheet = .requests }
                        Button("Lock Chats", systemImage: "lock") { Task { await lock() } }
                    } label: {
                        Image(systemName: overview.incoming.isEmpty ? "ellipsis.circle" : "person.crop.circle.badge.plus")
                    }
                    .accessibilityLabel("Chat options")
                    Button { sheet = .compose } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel("New chat")
                }
            }
        }
        .navigationDestination(item: $selected) { thread in
            ChatConversationView(owner: owner, thread: thread, service: service, active: onScreen,
                                 onLocked: forget, onRefresh: refresh)
        }
        .sheet(item: $sheet) { sheet in
            if let overview {
                switch sheet {
                case .compose:
                    ChatComposeView(overview: overview, service: service) { id in
                        self.sheet = nil
                        Task {
                            await refresh()
                            selected = self.overview?.threads.first(where: { $0.id == id })
                        }
                    }
                case .requests:
                    ChatRequestsView(overview: overview, service: service, onChange: refresh)
                }
            }
        }
        .task(id: polling) {
            guard polling else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled else { return }
                await refresh()
            }
        }
        .privacySensitive()
    }

    private var unlockView: some View {
        ScrollView {
            NativeCard {
                VStack(alignment: .leading, spacing: 16) {
                    Label("Unlock Chats", systemImage: "lock.shield")
                        .font(.title3.bold())
                    Text("Enter your InFlite password to unlock your encrypted conversations on this device.")
                        .foregroundStyle(.secondary)
                    SecureField("InFlite password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .padding(12)
                        .background(.primary.opacity(0.06), in: .rect(cornerRadius: 12))
                        .disabled(working)
                        .onSubmit(unlock)
                    Button(action: unlock) {
                        if working { ProgressView().frame(maxWidth: .infinity) }
                        else { Text("Unlock").frame(maxWidth: .infinity) }
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .disabled(working || password.isEmpty)
                    if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .padding(18)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func conversations(_ overview: ChatOverview) -> some View {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = overview.threads.filter { thread in
            query.isEmpty || thread.name.localizedCaseInsensitiveContains(query)
                || thread.subtitle.localizedCaseInsensitiveContains(query)
        }
        return List {
            if let issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            if visible.isEmpty {
                if query.isEmpty {
                    ContentUnavailableView {
                        Label("No conversations yet", systemImage: "bubble.left.and.bubble.right")
                    } actions: {
                        Button("Find a friend") { sheet = .requests }
                            .buttonStyle(.bordered)
                    }
                    .listRowBackground(Color.clear)
                } else {
                    ContentUnavailableView.search(text: query)
                        .listRowBackground(Color.clear)
                }
            } else {
                Section {
                    ForEach(visible) { thread in
                        Button { selected = thread } label: {
                            ChatThreadRow(thread: thread)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await refresh() }
    }

    private func unlock() {
        guard !working, !password.isEmpty else { return }
        let entry = password
        password = ""
        working = true
        issue = nil
        Task {
            defer { working = false }
            do {
                overview = try await service.unlock(password: entry)
            } catch is CancellationError {
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func refresh() async {
        do {
            let value = try await service.overview()
            try Task.checkCancellation()
            overview = value
            issue = nil
        } catch ChatError.locked {
            forget()
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func lock() async {
        forget()
        await service.lock()
    }

    private func forget() {
        selected = nil
        sheet = nil
        search = ""
        password = ""
        overview = nil
    }
}

private struct ChatThreadRow: View {
    let thread: ChatThread

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: thread.group ? "person.2.fill" : "person.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(NativeStyle.accent)
                .frame(width: 42, height: 42)
                .background(NativeStyle.accent.opacity(0.11), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: thread.name).font(.headline)
                Text(verbatim: thread.keyChanged ? "Check safety number" : (thread.last?.text ?? thread.subtitle))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                if let date = thread.last?.wire.date {
                    Text(date, style: .date).font(.caption).foregroundStyle(.secondary)
                }
                if thread.unread > 0 {
                    Text(thread.unread, format: .number)
                        .font(.caption.bold())
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(NativeStyle.accent.opacity(0.15), in: Capsule())
                        .accessibilityLabel("\(thread.unread) unread")
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

private struct ChatComposeView: View {
    let overview: ChatOverview
    let service: ChatService
    let onOpen: (String) -> Void

    @State private var creatingGroup = false
    @State private var name = ""
    @State private var members = Set<String>()
    @State private var busy = false
    @State private var issue: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if creatingGroup {
                    Section("Group name") { TextField("Name", text: $name) }
                }
                Section("Friends") {
                    ForEach(overview.friends) { friend in
                        Button {
                            if creatingGroup {
                                if members.contains(friend.id) { members.remove(friend.id) }
                                else { members.insert(friend.id) }
                            } else {
                                onOpen(friend.id)
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(verbatim: friend.displayName).foregroundStyle(.primary)
                                    Text(verbatim: "@\(friend.handle)").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if creatingGroup {
                                    Image(systemName: members.contains(friend.id) ? "checkmark.circle.fill" : "circle")
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(members.contains(friend.id) ? .isSelected : [])
                    }
                    if overview.friends.isEmpty { Text("You haven’t added any friends yet.").foregroundStyle(.secondary) }
                }
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
                if !overview.friends.isEmpty {
                    Section {
                        if creatingGroup {
                            Button("Create group", action: createGroup)
                                .disabled(busy || members.isEmpty || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        } else {
                            Button("New group", systemImage: "person.2.badge.plus") { creatingGroup = true }
                        }
                    }
                }
            }
            .navigationTitle(creatingGroup ? "New group" : "New chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func createGroup() {
        guard !busy else { return }
        busy = true
        issue = nil
        Task {
            defer { busy = false }
            do {
                let id = try await service.createGroup(name: name, friends: members)
                onOpen(id)
            } catch {
                issue = error.localizedDescription
            }
        }
    }
}

private struct ChatRequestsView: View {
    let overview: ChatOverview
    let service: ChatService
    let onChange: () async -> Void
    @State private var handle = ""
    @State private var busy = false
    @State private var status: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Add a friend") {
                    TextField("InFlite handle", text: $handle)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.send)
                    Button("Send friend request") {
                        mutate {
                            let reply = try await service.requestFriend(handle)
                            handle = ""
                            return reply
                        }
                    }
                    .disabled(busy || handle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
                }
                if !overview.incoming.isEmpty {
                    Section("Received") {
                        ForEach(overview.incoming) { person in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(verbatim: person.displayName).font(.headline)
                                Text(verbatim: "@\(person.handle)").font(.caption).foregroundStyle(.secondary)
                                HStack {
                                    Button("Accept") { respond(person, accept: true) }.buttonStyle(.borderedProminent)
                                    Button("Decline") { respond(person, accept: false) }.buttonStyle(.bordered)
                                }
                                .buttonBorderShape(.capsule)
                                .disabled(busy)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                if !overview.outgoing.isEmpty {
                    Section("Sent") {
                        ForEach(overview.outgoing) { person in
                            LabeledContent {
                                Text("Waiting").foregroundStyle(.secondary)
                            } label: {
                                Text(verbatim: "@\(person.handle)")
                            }
                        }
                    }
                }
            }
            .navigationTitle("Friend requests")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func respond(_ person: ChatPerson, accept: Bool) {
        mutate {
            try await service.respond(to: person, accept: accept)
            return accept ? "Friend request accepted." : "Friend request declined."
        }
    }

    private func mutate(_ operation: @escaping () async throws -> String) {
        guard !busy else { return }
        busy = true
        status = nil
        Task {
            defer { busy = false }
            do {
                status = try await operation()
                await onChange()
            } catch {
                status = error.localizedDescription
            }
        }
    }
}

private struct ChatConversationView: View {
    let owner: String
    let thread: ChatThread
    let service: ChatService
    let active: Bool
    let onLocked: () -> Void
    let onRefresh: () async -> Void

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var attempt: SendAttempt?
    @State private var loading = true
    @State private var sending = false
    @State private var issue: String?
    @State private var safety = false
    @State private var media: ChatMessage?
    @State private var attachment: ChatDraftAttachment?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var pickingPhoto = false
    @State private var pickingFile = false
    @State private var openingAttachment = false
    @State private var viewOnce = true
    @State private var keyChanged: Bool
    @State private var delivery: Delivery
    @FocusState private var focused: Bool

    private enum Delivery: String, CaseIterable {
        case now = "Instant", standard = "Standard pigeon", swift = "Swift pigeon"
        var pigeon: String? { self == .now ? nil : self == .standard ? "standard" : "swift" }
    }

    private struct SendAttempt {
        let id = UUID().uuidString.lowercased()
        let text: String
        let delivery: Delivery
        let attachmentID: UUID?
        let viewOnce: Bool
    }

    init(
        owner: String, thread: ChatThread, service: ChatService, active: Bool,
        onLocked: @escaping () -> Void, onRefresh: @escaping () async -> Void
    ) {
        self.owner = owner
        self.thread = thread
        self.service = service
        self.active = active
        self.onLocked = onLocked
        self.onRefresh = onRefresh
        _keyChanged = State(initialValue: thread.keyChanged)
        _delivery = State(initialValue: thread.sendByPigeon ? .standard : .now)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 11) {
                    if loading && messages.isEmpty {
                        ProgressView("Opening conversation").padding(28)
                    } else if messages.isEmpty {
                        ContentUnavailableView("No messages yet", systemImage: "bubble.left")
                    }
                    ForEach(messages) { message in
                        let mine = message.wire.from == owner
                        messageRow(message, mine: mine)
                            .id(message.id)
                    }
                    Color.clear.frame(height: 1).id("latest")
                }
                .padding(16)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load() }
            .onChange(of: messages.last?.id) { _, _ in
                if sending || messages.count == 1 { proxy.scrollTo("latest", anchor: .bottom) }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        }
        .navigationTitle(thread.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { safety = true } label: {
                    Image(systemName: keyChanged ? "exclamationmark.shield" : "lock.shield")
                }
                .accessibilityLabel("Safety numbers")
            }
        }
        .task(id: active) {
            guard active else { return }
            await load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled else { return }
                await onRefresh()
                await load()
            }
        }
        .sheet(isPresented: $safety) {
            ChatSafetyView(thread: thread, service: service) { changed in
                keyChanged = changed
                await load()
                await onRefresh()
            }
        }
        .sheet(item: $media) { message in
            ChatMediaView(service: service, thread: thread, message: message)
        }
        .photosPicker(isPresented: $pickingPhoto, selection: $selectedPhoto, matching: .images,
                      preferredItemEncoding: .compatible)
        .task(id: selectedPhoto) {
            guard let item = selectedPhoto else { return }
            openingAttachment = true
            defer { openingAttachment = false }
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { throw ChatError.invalidMessage }
                try Task.checkCancellation()
                attachment = try ChatDraftAttachment(data: data)
                viewOnce = true
                issue = nil
            } catch is CancellationError {
            } catch {
                issue = error.localizedDescription
            }
            selectedPhoto = nil
        }
        .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.data]) { result in
            switch result {
            case .success(let url): openFile(url)
            case .failure(let error): issue = error.localizedDescription
            }
        }
        .privacySensitive()
    }

    private func messageRow(_ message: ChatMessage, mine: Bool) -> some View {
        HStack {
            if mine { Spacer(minLength: 38) }
            VStack(alignment: .leading, spacing: 5) {
                Text(verbatim: message.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                if message.media != nil && message.wire.photo == 1 && (!mine || message.wire.once != true) {
                    Button(attachmentTitle(message), systemImage: attachmentIcon(message)) { media = message }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                }
                HStack(spacing: 5) {
                    Text(message.wire.date, style: .time)
                    if message.wire.flying == true { Image(systemName: "bird") }
                    else if mine && message.wire.readAt != nil { Image(systemName: "checkmark.circle.fill").accessibilityLabel("Read") }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background {
                if mine { NativeStyle.accent.opacity(0.18) }
                else { Rectangle().fill(.regularMaterial) }
            }
            .clipShape(.rect(cornerRadius: 16))
            if !mine { Spacer(minLength: 38) }
        }
    }

    private func attachmentTitle(_ message: ChatMessage) -> String {
        if let file = message.media?.f { return ChatDraftAttachment.safeName(file.n) }
        if message.voice { return "Play voice message" }
        return message.wire.once == true ? "Open once" : "Open photo"
    }

    private func attachmentIcon(_ message: ChatMessage) -> String {
        if message.media?.f != nil { return "doc" }
        return message.voice ? "play.circle" : "photo"
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if keyChanged {
                Button("Check safety numbers to send", systemImage: "exclamationmark.shield") { safety = true }
                    .font(.footnote.weight(.semibold))
            }
            if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
            if let attachment {
                HStack(spacing: 8) {
                    Label(attachment.title, systemImage: attachment.file == nil ? "photo" : "doc")
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if attachment.file == nil {
                        Toggle("View once", isOn: $viewOnce)
                            .fixedSize(horizontal: true, vertical: false)
                            .accessibilityHint("The recipient can open the photo once.")
                    }
                    Button("Remove attachment", systemImage: "xmark.circle.fill") { self.attachment = nil }
                        .labelStyle(.iconOnly)
                }
                .font(.caption)
                .disabled(sending)
            }
            HStack(alignment: .bottom, spacing: 8) {
                Menu {
                    Picker("Delivery", selection: $delivery) {
                        ForEach(Delivery.allCases, id: \.self) { method in Text(method.rawValue).tag(method) }
                    }
                } label: {
                    Image(systemName: delivery == .now ? "bolt.circle" : "bird.circle")
                        .font(.title2)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Delivery")
                .accessibilityValue(delivery.rawValue)
                .disabled(sending)
                Menu {
                    Button("Choose photo", systemImage: "photo") { pickingPhoto = true }
                    Button("Choose file", systemImage: "doc") { pickingFile = true }
                } label: {
                    if openingAttachment { ProgressView().frame(width: 36, height: 44) }
                    else { Image(systemName: "plus.circle").font(.title2).frame(width: 36, height: 44) }
                }
                .accessibilityLabel("Attach a photo or file")
                .disabled(sending || openingAttachment || keyChanged)
                TextField("Message", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($focused)
                    .padding(10)
                    .background(.primary.opacity(0.06), in: .rect(cornerRadius: 16))
                    .disabled(sending)
                Button(action: send) {
                    if sending { ProgressView().frame(width: 44, height: 44) }
                    else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title)
                            .frame(width: 44, height: 44)
                    }
                }
                .accessibilityLabel("Send message")
                .disabled(keyChanged || sending || openingAttachment || draft.utf16.count > 2_000 ||
                          (attachment == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
        }
        .padding(10)
        .background(.regularMaterial)
    }

    private func load() async {
        do {
            let loaded = try await service.history(for: thread)
            try Task.checkCancellation()
            messages = loaded
            keyChanged = (try await service.safetyNumbers(for: thread)).contains(where: \.changed)
            loading = false
            if !sending { issue = nil }
            let waiting = loaded.filter {
                $0.wire.from != owner && $0.wire.readAt == nil && $0.wire.flying != true && $0.wire.lost != true && $0.wire.stopover != true
            }
            if !waiting.isEmpty && waiting.allSatisfy(\.couldDecrypt) {
                try await service.markRead(thread)
            }
        } catch ChatError.locked {
            onLocked()
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
            loading = false
        }
    }

    private func send() {
        guard !sending, !keyChanged else { return }
        let wanted = SendAttempt(text: draft, delivery: delivery, attachmentID: attachment?.id, viewOnce: viewOnce)
        let request = attempt.flatMap {
            $0.text == wanted.text && $0.delivery == wanted.delivery && $0.attachmentID == wanted.attachmentID &&
            $0.viewOnce == wanted.viewOnce ? $0 : nil
        } ?? wanted
        let attachment = self.attachment
        attempt = request
        sending = true
        issue = nil
        Task {
            defer { sending = false }
            do {
                let sent = try await service.send(request.text, in: thread, id: request.id, pigeon: request.delivery.pigeon,
                                                  attachment: attachment, viewOnce: request.viewOnce)
                if !messages.contains(where: { $0.id == sent.id }) { messages.append(sent) }
                draft = ""
                self.attachment = nil
                attempt = nil
                await onRefresh()
            } catch ChatError.locked {
                onLocked()
            } catch ChatError.contactChanged {
                keyChanged = true
                issue = ChatError.contactChanged.localizedDescription
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func openFile(_ url: URL) {
        openingAttachment = true
        Task {
            defer { openingAttachment = false }
            do {
                let item = try await Task.detached(priority: .userInitiated) {
                    let accessed = url.startAccessingSecurityScopedResource()
                    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                    let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
                    guard values.isRegularFile == true, let size = values.fileSize, size <= ChatDraftAttachment.maximumSize else {
                        throw ChatError.attachmentSize
                    }
                    return try ChatDraftAttachment(data: Data(contentsOf: url), name: url.lastPathComponent,
                                                   mediaType: values.contentType?.preferredMIMEType ?? "application/octet-stream")
                }.value
                attachment = item
                issue = nil
            } catch {
                issue = error.localizedDescription
            }
        }
    }
}

private struct ChatSafetyView: View {
    let thread: ChatThread
    let service: ChatService
    let onVerified: (Bool) async -> Void

    @State private var numbers: [ChatSafetyNumber] = []
    @State private var pending: ChatSafetyNumber?
    @State private var failure: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Compare these numbers with the other person in person or on a trusted call before marking their key verified.")
                        .foregroundStyle(.secondary)
                    if let failure { Text(failure).foregroundStyle(.secondary) }
                }
                ForEach(numbers) { number in
                    Section(number.name) {
                        Text(verbatim: number.number)
                            .font(.body.monospaced())
                            .textSelection(.enabled)
                        Button(number.changed ? "Verify changed key" : "Mark verified") { pending = number }
                    }
                }
            }
            .navigationTitle("Safety numbers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { await load() }
            .confirmationDialog("Do the safety numbers match?", isPresented: Binding(
                get: { pending != nil }, set: { if !$0 { pending = nil } }
            ), titleVisibility: .visible, presenting: pending) { number in
                Button("I compared them and they match") { Task { await verify(number) } }
            }
        }
    }

    private func load() async {
        do { numbers = try await service.safetyNumbers(for: thread) }
        catch { failure = error.localizedDescription }
    }

    private func verify(_ number: ChatSafetyNumber) async {
        do {
            try await service.verify(number, in: thread)
            await load()
            await onVerified(numbers.contains(where: \.changed))
        } catch {
            failure = error.localizedDescription
        }
    }
}

private struct ChatMediaView: View {
    let service: ChatService
    let thread: ChatThread
    let message: ChatMessage

    @State private var data: Data?
    @State private var image: UIImage?
    @State private var player: AVAudioPlayer?
    @State private var issue: String?
    @State private var exporting = false
    @Environment(\.dismiss) private var dismiss

    private var fileName: String {
        message.media?.f.map { ChatDraftAttachment.safeName($0.n) } ?? "Chat attachment"
    }

    private var fileType: UTType { message.media?.f?.m.flatMap { UTType(mimeType: $0) } ?? .data }

    var body: some View {
        NavigationStack {
            Group {
                if let issue {
                    ContentUnavailableView("Couldn’t open attachment", systemImage: "exclamationmark.circle",
                                           description: Text(issue))
                } else if let data {
                    if message.media?.f != nil {
                        VStack(spacing: 16) {
                            Image(systemName: "doc").font(.largeTitle)
                            Text(verbatim: fileName)
                            Text(ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file))
                                .font(.footnote).foregroundStyle(.secondary)
                            Button("Save to Files", systemImage: "square.and.arrow.down") { exporting = true }
                                .buttonStyle(.borderedProminent)
                        }
                        .padding()
                    } else if message.voice {
                        VStack(spacing: 16) {
                            Image(systemName: "waveform").font(.largeTitle)
                            Button("Play", systemImage: "play.fill", action: play)
                                .buttonStyle(.borderedProminent)
                        }
                    } else if let image {
                        Image(uiImage: image).resizable().scaledToFit().padding(16)
                            .accessibilityLabel("Chat photo")
                    } else {
                        ContentUnavailableView("Photo format unavailable", systemImage: "photo")
                    }
                } else {
                    ProgressView("Opening attachment")
                }
            }
            .navigationTitle(message.media?.f != nil ? "Attachment" : (message.voice ? "Voice message" : "Photo"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task {
                do {
                    let bytes = try await service.media(message, in: thread)
                    if !message.voice && message.media?.f == nil { image = thumbnail(bytes) }
                    data = bytes
                }
                catch is CancellationError { }
                catch { issue = error.localizedDescription }
            }
            .fileExporter(isPresented: $exporting, document: data.map(ChatAttachmentDocument.init(data:)),
                          contentType: fileType, defaultFilename: fileName) { result in
                if case .failure(let error) = result { issue = error.localizedDescription }
            }
        }
        .onDisappear { player?.stop() }
        .privacySensitive()
    }

    private func play() {
        guard let data else { return }
        do {
            let player = try AVAudioPlayer(data: data)
            player.play()
            self.player = player
        } catch {
            issue = error.localizedDescription
        }
    }

    private func thumbnail(_ data: Data) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                       kCGImageSourceThumbnailMaxPixelSize: 2048,
                                       kCGImageSourceCreateThumbnailWithTransform: true]
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions),
              let pixels = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: pixels)
    }
}

private struct ChatAttachmentDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.data]
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
