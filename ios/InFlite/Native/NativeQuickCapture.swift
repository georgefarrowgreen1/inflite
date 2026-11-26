import CryptoKit
import ImageIO
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct NativeQuickCapture: View {
    let owner: String
    var onSaved: (InFliteRoute?) -> Void = { _ in }

    private enum Mode: String, CaseIterable {
        case note = "Note", reminder = "Reminder", file = "File"
    }

    private enum Repeat: String, CaseIterable {
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
    @State private var mode: Mode = .note
    @State private var note = ""
    @State private var noteID = OrganiseService.identifier()
    @State private var noteAttempt: OrganiseSave?
    @State private var reminderTitle = ""
    @State private var reminderNotes = ""
    @State private var scheduled = true
    @State private var dueAt = Date().addingTimeInterval(3_600)
    @State private var repeatFrequency: Repeat = .never
    @State private var notify = true
    @State private var reminderAttempt: (value: CaptureReminder, id: String)?
    @State private var pickingFile = false
    @State private var photo: PhotosPickerItem?
    @State private var file: CaptureFile?
    @State private var busy = false
    @State private var failure: String?
    @State private var saved = false
    @State private var progress: Double?

    var body: some View {
        NavigationStack {
            Form {
                if saved {
                    confirmation
                } else {
                    Section {
                        Picker("Capture type", selection: $mode) {
                            ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    .disabled(busy)
                    switch mode {
                    case .note: noteFields
                    case .reminder: reminderFields
                    case .file: fileFields
                    }
                    Section {
                        if let failure { Text(failure).foregroundStyle(.secondary) }
                        if let progress, busy { ProgressView(value: progress) { Text("Uploading file") } }
                        Button(saveTitle) { Task { await save() } }
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .disabled(!canSave)
                    }
                    .disabled(busy)
                }
            }
            .scrollContentBackground(.hidden)
            .background { NativeWallpaper(animate: false) }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Quick Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if busy { ProgressView().accessibilityLabel("Saving") }
                    else { Button(saved ? "Done" : "Cancel", action: close) }
                }
            }
        }
        .interactiveDismissDisabled(busy || saved)
        .onChange(of: mode) { _, _ in failure = nil }
        .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.data]) { result in
            Task { await importFile(result) }
        }
        .task(id: photo) { if let photo { await importPhoto(photo) } }
        .tint(NativeStyle.accent)
    }

    private var noteFields: some View {
        Section {
            TextField("Write a note…", text: $note, axis: .vertical).lineLimit(5...14)
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
                TextField("What do you need to do?", text: $reminderTitle)
                TextField("Notes", text: $reminderNotes, axis: .vertical).lineLimit(2...6)
            }
            Section("Schedule") {
                Toggle("Set a date", isOn: $scheduled)
                if scheduled {
                    DatePicker("Remind me", selection: $dueAt)
                    Picker("Repeat", selection: $repeatFrequency) {
                        ForEach(Repeat.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    Toggle("Notify registered devices", isOn: $notify)
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

    private var confirmation: some View {
        Section {
            Label(confirmationTitle, systemImage: "checkmark.circle.fill")
                .foregroundStyle(NativeStyle.accent)
            if mode != .reminder {
                Button(mode == .note ? "Open Notes" : "Open Files") {
                    onSaved(mode == .note ? .notes : .files)
                    dismiss()
                }
            }
        }
    }

    private var saveTitle: String {
        switch mode {
        case .note: "Save note"
        case .reminder: "Add reminder"
        case .file: "Save to My Drive"
        }
    }

    private var confirmationTitle: String {
        switch mode {
        case .note: "Saved to Notes"
        case .reminder: "Reminder saved"
        case .file: "Saved to My Drive"
        }
    }

    private var canSave: Bool {
        guard !busy else { return false }
        switch mode {
        case .note: return !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .reminder: return !reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .file: return file != nil
        }
    }

    private func close() {
        if saved { onSaved(nil) }
        dismiss()
    }

    @MainActor
    private func save() async {
        guard canSave else { return }
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
            saved = true
            file = nil
        } catch {
            if !Task.isCancelled { failure = error.localizedDescription }
        }
    }

    @MainActor
    private func saveNote() async throws {
        let raw = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = raw.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        let title = lines.first.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        guard !title.isEmpty, title.utf16.count <= 160 else {
            throw CaptureIssue("Use a first line of up to 160 characters for the note title.")
        }
        let text = lines.count > 1 ? String(lines[1]) : ""
        guard text.utf16.count <= 64_000 else { throw CaptureIssue("Notes can contain up to 64,000 characters.") }
        let value = OrganiseValue(title: title, links: [], text: text, checklist: [])
        let attempt: OrganiseSave
        if let noteAttempt, noteAttempt.value == value {
            attempt = noteAttempt
        } else {
            attempt = try OrganiseSave(kind: .notes, id: noteID, version: 0, value: value)
            noteAttempt = attempt
        }
        _ = try await OrganiseService(owner: owner).save(attempt)
    }

    @MainActor
    private func saveReminder() async throws {
        let value = CaptureReminder(
            title: reminderTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            notes: reminderNotes.trimmingCharacters(in: .whitespacesAndNewlines),
            dueAt: scheduled ? OrganiseDate.stamp(dueAt) : nil,
            notify: scheduled && notify,
            frequency: scheduled && repeatFrequency != .never ? repeatFrequency.rawValue : nil,
            timezone: TimeZone.current.identifier
        )
        guard !value.title.isEmpty, value.title.utf16.count <= 160, value.notes.utf16.count <= 2_000 else {
            throw CaptureIssue("Use up to 160 characters for the title and 2,000 for notes.")
        }
        let id = reminderAttempt.flatMap { $0.value == value ? $0.id : nil } ?? OrganiseService.identifier()
        reminderAttempt = (value, id)
        try await value.save(owner: owner, id: id)
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

private struct CaptureIssue: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private struct CaptureReminder: Equatable {
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
