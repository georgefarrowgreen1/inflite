import SwiftUI
import UniformTypeIdentifiers

enum MailReplyKind: String, Identifiable {
    case reply, all, forward

    var id: Self { self }

    var title: String {
        switch self {
        case .reply: "Reply"
        case .all: "Reply All"
        case .forward: "Forward"
        }
    }

    var symbol: String {
        switch self {
        case .reply: "arrowshape.turn.up.left"
        case .all: "arrowshape.turn.up.left.2"
        case .forward: "arrowshape.turn.up.right"
        }
    }
}

enum MailComposeSource {
    case new
    case draft(String)
    case responding(MailMessage, MailReplyKind)

    var title: String {
        switch self {
        case .new: "New message"
        case .draft: "Edit draft"
        case .responding(_, let kind): kind.title
        }
    }
}

@MainActor
struct MailComposer: View {
    let service: MailService
    var source: MailComposeSource = .new

    @Environment(\.dismiss) private var dismiss
    @State private var identity: MailIdentity?
    @State private var from = ""
    @State private var to = ""
    @State private var cc = ""
    @State private var bcc = ""
    @State private var recipientNames: [String: String] = [:]
    @State private var subject = ""
    @State private var words = ""
    @State private var inReplyTo: String?
    @State private var references: MailReferences?
    @State private var quote: MailQuote?
    @State private var quoteOld = false
    @State private var files: [MailDraftFile] = []
    @State private var showingFiles = false
    @State private var draftID = UUID().uuidString
    @State private var sendKey = UUID().uuidString
    @State private var busy = false
    @State private var sendPending = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                if let identity {
                    addressing(identity)
                    Section("Message") {
                        TextEditor(text: $words)
                            .frame(minHeight: 155)
                            .accessibilityLabel("Message")
                            .disabled(busy || sendPending)
                        if quote != nil || quoteOld {
                            Label("Original message included", systemImage: "text.quote")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    attachments
                    if !sendPending {
                        Button("Save draft") { Task { await save(thenSend: false) } }
                            .disabled(busy)
                    }
                } else if issue == nil {
                    ProgressView("Loading Mail")
                } else {
                    Button("Try again") { Task { await prepare() } }
                        .disabled(busy)
                }
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
                if busy, identity != nil { ProgressView() }
            }
            .privacySensitive()
            .interactiveDismissDisabled(busy)
            .navigationTitle(source.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sendPending ? "Retry send" : "Send") { Task { await save(thenSend: true) } }
                        .disabled(busy || identity == nil)
                }
            }
            .task { await prepare() }
            .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
                Task { await importFiles(result) }
            }
        }
    }

    private func addressing(_ identity: MailIdentity) -> some View {
        Section {
            Picker("From", selection: $from) {
                ForEach(identity.identities, id: \.self) { address in
                    Text(verbatim: address).tag(address)
                }
            }
            recipientField("To", text: $to)
            recipientField("Cc", text: $cc)
            recipientField("Bcc", text: $bcc)
            TextField("Subject", text: $subject)
        }
        .disabled(busy || sendPending)
    }

    private func recipientField(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text, prompt: Text("Separate addresses with commas"))
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
    }

    private var attachments: some View {
        Section("Attachments") {
            ForEach(files) { file in
                HStack {
                    Image(systemName: "paperclip").accessibilityHidden(true)
                    VStack(alignment: .leading) {
                        Text(verbatim: file.filename)
                        Text(ByteCountFormatter.string(fromByteCount: file.size, countStyle: .file))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(role: .destructive) {
                        files.removeAll { $0.id == file.id }
                    } label: {
                        Image(systemName: "xmark.circle")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Remove \(file.filename)")
                }
            }
            Button("Add attachments", systemImage: "plus") { showingFiles = true }
                .disabled(files.count >= MailDraftFile.maximumFiles)
        }
        .disabled(busy || sendPending)
    }

    private func prepare() async {
        guard !busy, identity == nil else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            let identity = try await service.identity()
            switch source {
            case .new:
                from = identity.defaultFrom
            case .draft(let id):
                let draft = try await service.draft(id)
                try Task.checkCancellation()
                let fields = draft.compose
                draftID = draft.id
                from = identity.identities.contains(fields.from) ? fields.from : identity.defaultFrom
                setRecipients(to: fields.to, cc: fields.cc, bcc: fields.bcc)
                subject = fields.subject
                words = fields.text
                files = fields.files
                inReplyTo = fields.inReplyTo
                references = fields.references
                quote = fields.quote
                quoteOld = draft.quoteOld
            case .responding(let message, let kind):
                prepareReply(message, kind: kind, identity: identity)
            }
            try Task.checkCancellation()
            self.identity = identity
        } catch {
            if !Task.isCancelled { issue = error.localizedDescription }
        }
    }

    private func prepareReply(_ message: MailMessage, kind: MailReplyKind, identity: MailIdentity) {
        let mailbox = message.mailbox?.lowercased()
        from = identity.identities.first { $0.lowercased() == mailbox } ?? identity.defaultFrom
        let baseSubject = message.subject.replacingOccurrences(
            of: #"^(?:(?:re|fwd?)\s*:\s*)+"#, with: "", options: [.regularExpression, .caseInsensitive]
        )
        subject = (kind == .forward ? "Fwd: " : "Re: ") + baseSubject
        quote = MailQuote(of: message.id, mode: kind.rawValue)
        if kind == .forward {
            files = message.attachments.map { MailDraftFile(reference: $0) }
            return
        }
        inReplyTo = message.messageId
        references = message.references
        var seen = Set(identity.identities.map { $0.lowercased() })
        func unique(_ entries: [MailPerson]) -> [MailPerson] {
            entries.filter { !$0.email.isEmpty && seen.insert($0.email.lowercased()).inserted }
        }
        let sender = message.replyTo.map { MailPerson(name: message.from.name, email: $0) } ?? message.from
        let primary = message.folder == "sent" ? message.to : [sender]
        let to = unique(primary + (kind == .all ? message.to : []))
        let cc = kind == .all ? unique(message.cc) : []
        setRecipients(to: to, cc: cc, bcc: [])
    }

    private func setRecipients(to: [MailPerson], cc: [MailPerson], bcc: [MailPerson]) {
        for person in to + cc + bcc where !person.name.isEmpty {
            recipientNames[person.email.lowercased()] = person.name
        }
        self.to = to.map(\.email).joined(separator: ", ")
        self.cc = cc.map(\.email).joined(separator: ", ")
        self.bcc = bcc.map(\.email).joined(separator: ", ")
    }

    private func recipients(_ text: String) -> [MailPerson] {
        text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.map {
            MailPerson(name: recipientNames[$0.lowercased()] ?? "", email: $0)
        }
    }

    private func save(thenSend: Bool) async {
        guard identity != nil, !busy else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            if !sendPending {
                let to = recipients(to)
                let cc = recipients(cc)
                let bcc = recipients(bcc)
                if thenSend {
                    let all = to + cc + bcc
                    guard (1...50).contains(all.count), all.allSatisfy({ entry in
                        entry.email.range(of: #"^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$"#, options: .regularExpression) != nil
                    }) else { throw MailServiceError.invalidRecipient }
                }
                guard files.count <= MailDraftFile.maximumFiles else { throw MailServiceError.tooManyFiles }
                guard files.reduce(Int64(0), { $0 + $1.size }) <= MailDraftFile.maximumBytes else {
                    throw MailServiceError.attachmentTooLarge
                }
                let draft = MailDraftInput(
                    id: draftID, accountOwner: service.owner, from: from, to: to, cc: cc, bcc: bcc,
                    subject: subject, text: words, inReplyTo: inReplyTo, references: references, quote: quote,
                    attachments: files
                )
                draftID = try await service.saveDraft(draft)
            }
            if thenSend {
                // Retrying an uncertain send uses the same draft and idempotency key.
                sendPending = true
                try await service.send(draft: draftID, key: sendKey)
            }
            dismiss()
        } catch let BackendError.http(status, message) where sendPending && [400, 413].contains(status) {
            sendPending = false
            sendKey = UUID().uuidString
            issue = message ?? "Check the message before sending again."
        } catch let error as MailServiceError {
            issue = error.localizedDescription
        } catch {
            issue = sendPending
                ? "Couldn’t confirm delivery. Retry send to check the same message."
                : "Couldn’t save the draft. Check your connection and try again."
        }
    }

    private func importFiles(_ result: Result<[URL], Error>) async {
        guard !busy, !sendPending else { return }
        busy = true
        issue = nil
        defer { busy = false }
        do {
            let urls = try result.get()
            guard files.count + urls.count <= MailDraftFile.maximumFiles else { throw MailServiceError.tooManyFiles }
            let used = files.reduce(Int64(0)) { $0 + $1.size }
            let selection = try await Task.detached(priority: .userInitiated) { () throws -> [MailDraftFile] in
                var available = Int64(MailDraftFile.maximumBytes) - used
                var selected: [MailDraftFile] = []
                for url in urls {
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .contentTypeKey])
                    guard values.isRegularFile == true else { throw MailServiceError.invalidAttachment }
                    guard available >= 0, let size = values.fileSize, size >= 0, size <= available else {
                        throw MailServiceError.attachmentTooLarge
                    }
                    let reader = try FileHandle(forReadingFrom: url)
                    defer { try? reader.close() }
                    let data = try reader.read(upToCount: Int(available) + 1) ?? Data()
                    guard data.count <= available else { throw MailServiceError.attachmentTooLarge }
                    let type = values.contentType?.preferredMIMEType ?? "application/octet-stream"
                    selected.append(MailDraftFile(filename: safeAttachmentName(url.lastPathComponent), type: type, content: data))
                    available -= Int64(data.count)
                }
                return selected
            }.value
            try Task.checkCancellation()
            files += selection
        } catch {
            if !Task.isCancelled { issue = error.localizedDescription }
        }
    }
}
