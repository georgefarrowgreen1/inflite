import CryptoKit
import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct QuickCaptureReceipt: Equatable {
    let title: String
    let destination: InFliteRoute
}

@MainActor
struct NativeQuickCapture: View {
    let owner: String
    var onSaved: (QuickCaptureReceipt) -> Void = { _ in }

    private enum Field: Hashable { case note, reminderTitle, reminderNotes }
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var field: Field?
    @State private var draft = CaptureDraft()
    @State private var persistedDraft: CaptureDraft?
    @State private var draftGeneration: Int?
    @State private var draftWrite: Task<Void, Never>?
    @State private var draftWriteFailed = false
    @State private var pickingFile = false
    @State private var photo: PhotosPickerItem?
    @State private var file: CaptureFile?
    @State private var busy = false
    @State private var failure: String?
    @State private var progress: Double?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Capture type", selection: $draft.mode) {
                        ForEach(CaptureMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                .disabled(busy)
                switch draft.mode {
                case .note: noteFields
                case .reminder: reminderFields
                case .file: fileFields
                }
            }
            .disabled(draftGeneration == nil)
            .scrollContentBackground(.hidden)
            .background { NativeWallpaper(animate: false) }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) { saveBar }
            .navigationTitle("Quick Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    NativeSheetCloseButton(title: "Close Quick Capture", action: close)
                        .disabled(busy)
                        .accessibilityIdentifier("capture-close")
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .task {
            guard draftGeneration == nil else { return }
            let stored = QuickCaptureDraftStore.restore(owner: owner)
            draft = stored.draft
            draftGeneration = stored.generation
            persistedDraft = stored.pendingWrite ? nil : stored.draft
            draftWriteFailed = stored.pendingWrite
        }
        .task(id: draftGeneration == nil ? nil : draft.mode) {
            guard draftGeneration != nil else { return }
            await Task.yield()
            guard !Task.isCancelled else { return }
            switch draft.mode {
            case .note: field = .note
            case .reminder: field = .reminderTitle
            case .file: field = nil
            }
        }
        .onChange(of: draft.mode) { _, _ in failure = nil }
        .onChange(of: draft) { _, _ in queueDraftWrite() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { flushDraft() }
        }
        .onDisappear { flushDraft() }
        .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.data]) { result in
            Task { await importFile(result) }
        }
        .task(id: photo) { if let photo { await importPhoto(photo) } }
        .tint(NativeStyle.accent)
    }

    private var saveBar: some View {
        VStack(spacing: 7) {
            if let failure {
                Text(failure).font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if draftWriteFailed {
                Text("This draft is available until InFlite closes.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let progress { ProgressView(value: progress) { Text("Uploading file") } }
            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    if busy && progress == nil { ProgressView().tint(.white).accessibilityHidden(true) }
                    Text(saveTitle)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .disabled(!canSave)
            .accessibilityIdentifier("capture-save")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .background(.regularMaterial)
    }

    private var noteFields: some View {
        Section {
            TextField("Write a note…", text: $draft.note, axis: .vertical)
                .lineLimit(5...14)
                .focused($field, equals: .note)
                .accessibilityIdentifier("capture-note-editor")
        } header: {
            Label("Notes", systemImage: "note.text")
        } footer: {
            Text("The first line becomes your title.")
        }
        .disabled(busy)
    }

    private var reminderFields: some View {
        Group {
            Section("Reminder") {
                TextField("What do you need to do?", text: $draft.reminderTitle)
                    .focused($field, equals: .reminderTitle)
                    .submitLabel(.next)
                    .onSubmit { field = .reminderNotes }
                    .accessibilityIdentifier("capture-reminder-title")
                TextField("Notes", text: $draft.reminderNotes, axis: .vertical)
                    .lineLimit(2...6)
                    .focused($field, equals: .reminderNotes)
            }
            Section("Schedule") {
                Toggle("Set a date", isOn: $draft.scheduled)
                if draft.scheduled {
                    DatePicker("Remind me", selection: $draft.dueAt)
                    Picker("Repeat", selection: $draft.repeatFrequency) {
                        ForEach(CaptureRepeat.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    Toggle("Notify registered devices", isOn: $draft.notify)
                }
            }
        }
        .disabled(busy)
    }

    private var fileFields: some View {
        Section {
            if let file {
                VStack(alignment: .leading, spacing: 5) {
                    Label(file.name, systemImage: "doc")
                    Text(ByteCountFormatter.string(fromByteCount: Int64(file.data.count), countStyle: .file))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Button { pickingFile = true } label: {
                Label("Choose a file", systemImage: "folder")
            }
            PhotosPicker(selection: $photo, matching: .images, preferredItemEncoding: .current) {
                Label("Choose a photo", systemImage: "photo")
            }
        } header: {
            Text("My Drive")
        } footer: {
            Text("Photos and documents up to 25 MB.")
        }
        .disabled(busy)
    }

    private var saveTitle: String {
        switch draft.mode {
        case .note: "Save note"
        case .reminder: "Add reminder"
        case .file: "Save to My Drive"
        }
    }

    private var canSave: Bool {
        guard !busy, draftGeneration != nil else { return false }
        switch draft.mode {
        case .note: return !draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .reminder: return !draft.reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .file: return file != nil
        }
    }

    private func close() {
        flushDraft()
        dismiss()
    }

    private func queueDraftWrite() {
        draftWrite?.cancel()
        draftWrite = Task {
            do { try await Task.sleep(for: .milliseconds(250)) }
            catch { return }
            persistDraft()
        }
    }

    private func flushDraft() {
        draftWrite?.cancel()
        draftWrite = nil
        persistDraft()
    }

    private func persistDraft() {
        guard let draftGeneration, draft != persistedDraft else { return }
        do {
            try QuickCaptureDraftStore.save(draft, owner: owner, generation: draftGeneration)
            persistedDraft = draft
            draftWriteFailed = false
        } catch {
            draftWriteFailed = true
        }
    }

    private func save() async {
        guard canSave else { return }
        let mode = draft.mode
        failure = nil
        busy = true
        defer { busy = false; progress = nil }
        do {
            switch mode {
            case .note: try await saveNote()
            case .reminder: try await saveReminder()
            case .file:
                guard let file else { return }
                progress = 0
                do {
                    try await CaptureDrive(owner: owner).upload(file) { progress = $0 }
                } catch BackendError.http(410, _) {
                    self.file = file.newAttempt()
                    throw CaptureIssue("The upload reservation expired. Save again to retry.")
                }
            }
            try Task.checkCancellation()
            draft.clearSavedContent(mode)
            file = nil
            flushDraft()
            field = nil
            dismiss()
            onSaved(mode.receipt)
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }

    private func saveNote() async throws {
        let raw = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = raw.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        let title = lines.first.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        guard !title.isEmpty, title.utf16.count <= 160 else {
            throw CaptureIssue("Use a first line of up to 160 characters for the note title.")
        }
        let text = lines.count > 1 ? String(lines[1]) : ""
        guard text.utf16.count <= 64_000 else { throw CaptureIssue("Notes can contain up to 64,000 characters.") }
        let value = OrganiseValue(title: title, links: [], text: text, checklist: [])
        let service = OrganiseService(owner: owner)
        let attempt: OrganiseSave
        if let noteAttempt = draft.noteAttempt, noteAttempt.value == value {
            attempt = noteAttempt
        } else {
            let version: Int
            if let previous = draft.noteAttempt {
                version = try await noteVersion(after: previous, service: service)
            } else {
                version = 0
            }
            attempt = try OrganiseSave(kind: .notes, id: draft.noteID, version: version, value: value)
            draft.noteAttempt = attempt
        }
        flushDraft()
        _ = try await service.save(attempt)
    }

    private func noteVersion(after previous: OrganiseSave, service: OrganiseService) async throws -> Int {
        let record: OrganiseRecord
        do {
            record = try await service.record(.notes, id: draft.noteID)
        } catch BackendError.http(404, _) where previous.version == 0 {
            // The first save has not been confirmed. A create still uses the same note ID.
            return 0
        }
        if record.id == draft.noteID, let version = record.version {
            if version == previous.version { return version }
            if version == previous.version + 1,
               record.title == previous.value.title, record.text == previous.value.text,
               record.checklist == previous.value.checklist, record.links == previous.value.links {
                return version
            }
        }
        throw CaptureIssue("This note changed. Review it in Notes. Your edits are still in Quick Capture.")
    }

    private func saveReminder() async throws {
        let value = CaptureReminder(
            title: draft.reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            notes: draft.reminderNotes.trimmingCharacters(in: .whitespacesAndNewlines),
            dueAt: draft.scheduled ? OrganiseDate.stamp(draft.dueAt) : nil,
            notify: draft.scheduled && draft.notify,
            frequency: draft.scheduled && draft.repeatFrequency != .never ? draft.repeatFrequency.rawValue : nil,
            timezone: draft.timezone
        )
        guard !value.title.isEmpty, value.title.utf16.count <= 160, value.notes.utf16.count <= 2_000 else {
            throw CaptureIssue("Use up to 160 characters for the title and 2,000 for notes.")
        }
        let id = draft.reminderOperationID ?? OrganiseService.identifier()
        // This API allocates the reminder ID. Keep the original create key even
        // after edits so a lost response cannot create a second reminder.
        draft.reminderOperationID = id
        flushDraft()
        do {
            try await value.save(owner: owner, id: id)
        } catch BackendError.http(409, let message) where message == "That action was used for a different reminder." {
            throw CaptureIssue("An earlier version of this reminder was saved. Review it in Reminders. Your edits are still in Quick Capture.")
        }
    }

    @MainActor
    private func importFile(_ result: Result<URL, Error>) async {
        guard !busy else { return }
        busy = true
        failure = nil
        defer { busy = false }
        do {
            let url = try result.get()
            file = try await CaptureFile.read(from: url)
        } catch {
            if !Task.isCancelled, (error as? CocoaError)?.code != .userCancelled { failure = error.localizedDescription }
        }
    }

    @MainActor
    private func importPhoto(_ selection: PhotosPickerItem) async {
        guard !busy else { return }
        busy = true
        failure = nil
        defer { busy = false; photo = nil }
        do {
            guard let data = try await selection.loadTransferable(type: Data.self),
                  let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let identifier = CGImageSourceGetType(source),
                  let type = UTType(identifier as String) else {
                throw CaptureIssue("This photo couldn’t be opened.")
            }
            let extensionName = type.preferredFilenameExtension ?? "image"
            let name = "Photo \(OrganiseDate.day(.now)) \(UUID().uuidString.prefix(6)).\(extensionName)"
            file = try CaptureFile(name: name, mime: type.preferredMIMEType ?? "application/octet-stream", data: data)
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }
}

private enum CaptureMode: String, CaseIterable, Codable {
    case note = "Note", reminder = "Reminder", file = "File"

    var receipt: QuickCaptureReceipt {
        switch self {
        case .note: QuickCaptureReceipt(title: "Saved to Notes", destination: .notes)
        case .reminder: QuickCaptureReceipt(title: "Reminder saved", destination: .reminders)
        case .file: QuickCaptureReceipt(title: "Saved to My Drive", destination: .files)
        }
    }
}

private enum CaptureRepeat: String, CaseIterable, Codable {
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

private struct CaptureDraft: Codable, Equatable {
    var mode: CaptureMode = .note
    var note = ""
    var noteID = OrganiseService.identifier()
    var noteAttempt: OrganiseSave?
    var reminderTitle = ""
    var reminderNotes = ""
    var scheduled = true
    var dueAt = Date().addingTimeInterval(3_600)
    var repeatFrequency: CaptureRepeat = .never
    var notify = true
    var timezone = TimeZone.current.identifier
    var reminderOperationID: String?

    var containsText: Bool {
        !note.isEmpty || !reminderTitle.isEmpty || !reminderNotes.isEmpty
    }

    mutating func clearSavedContent(_ kind: CaptureMode) {
        switch kind {
        case .note:
            note = ""
            noteID = OrganiseService.identifier()
            noteAttempt = nil
        case .reminder:
            reminderTitle = ""
            reminderNotes = ""
            scheduled = true
            dueAt = Date().addingTimeInterval(3_600)
            repeatFrequency = .never
            notify = true
            timezone = TimeZone.current.identifier
            reminderOperationID = nil
        case .file:
            break
        }
    }
}

@MainActor
enum QuickCaptureDraftStore {
    private static var generations: [String: Int] = [:]
    private static var pendingWrites: [String: CaptureDraft] = [:]

    fileprivate static func restore(owner: String) -> (draft: CaptureDraft, generation: Int, pendingWrite: Bool) {
        let pending = pendingWrites[owner]
        var draft = pending ?? readFile(owner: owner) ?? CaptureDraft()
        if draft.mode == .file {
            draft.mode = draft.note.isEmpty && draft.containsText ? .reminder : .note
        }
        return (draft, generations[owner, default: 0], pending != nil)
    }

    fileprivate static func save(_ draft: CaptureDraft, owner: String, generation: Int) throws {
        guard generation == generations[owner, default: 0] else { return }
        // Keep the text through reopening even if the protected file cannot be written yet.
        pendingWrites[owner] = draft
        let url = file(owner: owner)
        if draft.containsText {
            try NativeProtectedFile.write(JSONEncoder().encode(draft), to: url)
        } else if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        pendingWrites.removeValue(forKey: owner)
    }

    static func clear(owner: String) {
        generations[owner, default: 0] += 1
        pendingWrites.removeValue(forKey: owner)
        try? FileManager.default.removeItem(at: file(owner: owner))
    }

    private static func readFile(owner: String) -> CaptureDraft? {
        guard let data = try? Data(contentsOf: file(owner: owner)) else { return nil }
        return try? JSONDecoder().decode(CaptureDraft.self, from: data)
    }

    private static func file(owner: String) -> URL {
        let key = SHA256.hash(data: Data(owner.utf8)).map { String(format: "%02x", $0) }.joined()
        return URL.applicationSupportDirectory.appending(path: "InFlite/QuickCapture", directoryHint: .isDirectory)
            .appending(path: key + ".json", directoryHint: .notDirectory)
    }
}

private struct CaptureIssue: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private struct CaptureReminder {
    let title: String
    let notes: String
    let dueAt: Int64?
    let notify: Bool
    let frequency: String?
    let timezone: String

    func save(owner: String, id: String) async throws {
        struct Response: Decodable {
            struct Action: Decodable { let id: String }
            let action: Action
        }
        let recurrence: Any = frequency.map { ["frequency": $0, "timezone": timezone] as Any } ?? NSNull()
        let payload: [String: Any] = [
            "title": title, "notes": notes, "notify": notify, "operationId": id,
            "dueAt": dueAt.map { $0 as Any } ?? NSNull(), "recurrence": recurrence, "files": [], "source": NSNull()
        ]
        let body = try JSONSerialization.data(withJSONObject: payload, options: .sortedKeys)
        let result = try await BackendClient.shared.request(
            Response.self, path: "/api/system/actions", method: "POST", body: body, owner: owner
        )
        guard !result.action.id.isEmpty else { throw BackendError.invalidResponse }
    }
}

private struct CaptureFile: Sendable {
    static let limit = 25 * 1024 * 1024
    let operationId: String
    let name: String
    let mime: String
    let data: Data

    init(name: String, mime: String, data: Data) throws {
        guard data.count <= Self.limit else { throw CaptureIssue("Choose a file no larger than 25 MB.") }
        self.init(name: name, mime: mime, data: data, operationId: OrganiseService.identifier())
    }

    private init(name: String, mime: String, data: Data, operationId: String) {
        self.name = name
        self.mime = mime
        self.data = data
        self.operationId = operationId
    }

    func newAttempt() -> Self {
        Self(name: name, mime: mime, data: data, operationId: OrganiseService.identifier())
    }

    static func read(from url: URL) async throws -> Self {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let resources = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentTypeKey])
        guard resources.isRegularFile == true else { throw CaptureIssue("Choose a document or photo.") }
        if let size = resources.fileSize, size > limit { throw CaptureIssue("Choose a file no larger than 25 MB.") }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: limit + 1) ?? Data()
        try Task.checkCancellation()
        return try Self(name: url.lastPathComponent, mime: resources.contentType?.preferredMIMEType ?? "application/octet-stream", data: data)
    }
}

private struct CaptureDrive {
    let owner: String

    private struct Item: Decodable {
        let id: String
        let status: String
    }

    private struct Reply: Decodable {
        let item: Item?
        let partSize: Int?
        let parts: [String: String]?
    }

    func upload(_ file: CaptureFile, onProgress: @MainActor (Double) -> Void) async throws {
        let payload: [String: Any] = [
            "name": file.name, "mime": file.mime, "size": file.data.count,
            "parentId": NSNull(), "operationId": file.operationId
        ]
        let reservation = try await BackendClient.shared.request(
            Reply.self, path: "/api/files/uploads", method: "POST",
            body: JSONSerialization.data(withJSONObject: payload, options: .sortedKeys), owner: owner
        )
        guard let item = reservation.item, item.id.range(of: #"^[A-Za-z0-9_-]{32}$"#, options: .regularExpression) != nil else {
            throw BackendError.invalidResponse
        }
        if item.status == "ready" { return }
        guard item.status == "pending" else { throw BackendError.invalidResponse }

        let path = "/api/files/upload-parts"
        let query = [URLQueryItem(name: "id", value: item.id)]
        let expectedPartSize = 1024 * 1024
        if file.data.count <= expectedPartSize {
            try await uploadWhole(file, query: query, expectedID: item.id)
            return
        }

        let status: Reply
        do {
            status = try await BackendClient.shared.request(Reply.self, path: path, query: query, owner: owner)
        } catch BackendError.http(404, let message) where message == "Not found." {
            try await uploadWhole(file, query: query, expectedID: item.id)
            return
        }
        if let finished = status.item {
            try ensureReady(finished, id: item.id)
            return
        }
        guard status.partSize == expectedPartSize, let parts = status.parts else { throw BackendError.invalidResponse }
        for start in stride(from: 0, to: file.data.count, by: expectedPartSize) {
            try Task.checkCancellation()
            let end = min(start + expectedPartSize, file.data.count)
            let bytes = file.data.subdata(in: start..<end)
            let part = String(start / expectedPartSize)
            if let hash = parts[part] {
                let digest = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
                guard digest == hash else { throw CaptureIssue("The saved upload contains a different file.") }
            } else {
                let result = try await BackendClient.shared.request(
                    Reply.self, path: path, method: "PUT", query: query + [.init(name: "part", value: part)],
                    body: bytes, owner: owner, contentType: "application/octet-stream"
                )
                if let finished = result.item {
                    try ensureReady(finished, id: item.id)
                    return
                }
            }
            await onProgress(Double(end) / Double(file.data.count))
        }
        let final = try await BackendClient.shared.request(Reply.self, path: path, method: "POST", query: query, owner: owner)
        try ensureReady(final.item, id: item.id)
    }

    private func uploadWhole(_ file: CaptureFile, query: [URLQueryItem], expectedID: String) async throws {
        let result = try await BackendClient.shared.request(
            Reply.self, path: "/api/files/content", method: "PUT", query: query,
            body: file.data, owner: owner, contentType: "application/octet-stream"
        )
        try ensureReady(result.item, id: expectedID)
    }

    private func ensureReady(_ item: Item?, id: String) throws {
        guard let item, item.id == id, item.status == "ready" else { throw BackendError.invalidResponse }
    }
}
