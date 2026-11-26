import QuickLook
import SwiftUI
import UniformTypeIdentifiers

/// Projects a subset of message HTML into native text. No resource URLs, styles,
/// scripts, or sender-supplied markup are passed to a renderer.
enum NativeMailBody {
    private static let tokens = try! NSRegularExpression(
        pattern: #"<!--[\s\S]*?(?:-->|\z)|<![^>]*>|</?[A-Za-z][\w:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+|<"#
    )
    private static let tagName = try! NSRegularExpression(pattern: #"^</?([A-Za-z][\w:-]*)"#)
    private static let entities = try! NSRegularExpression(pattern: #"&(#x[\da-fA-F]{1,8}|#\d{1,10}|[A-Za-z]{2,16});"#)
    private static let attributes = try! NSRegularExpression(
        pattern: #"\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?"#
    )
    private static let hidden = try! NSRegularExpression(pattern: #"\s+hidden(?:[\s=>/])|\bdisplay\s*:\s*none\b"#, options: .caseInsensitive)
    private static let names = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
        "copy": "©", "reg": "®", "trade": "™", "middot": "·", "bull": "•",
        "ndash": "–", "mdash": "—", "hellip": "…", "lsquo": "‘", "rsquo": "’",
        "ldquo": "“", "rdquo": "”", "euro": "€", "pound": "£", "yen": "¥",
        "times": "×", "deg": "°", "minus": "−", "rarr": "→", "larr": "←"
    ]
    private static let ignored: Set<String> = ["head", "script", "style", "iframe", "object", "audio", "video", "svg", "math", "template", "noscript"]
    private static let void: Set<String> = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]
    private static let blocks: Set<String> = ["div", "p", "article", "section", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "table"]
    private static let strong: Set<String> = ["b", "strong", "th", "h1", "h2", "h3", "h4", "h5", "h6"]
    private static let italic: Set<String> = ["em", "i", "blockquote"]

    private struct Element {
        let name: String
        let hidden: Bool
        let link: URL?
    }

    static func readable(_ message: MailMessage) -> AttributedString {
        if let html = message.html, !html.isEmpty, html.utf8.count <= 512 * 1024 {
            let result = project(html)
            if !result.characters.allSatisfy(\.isWhitespace) { return result }
        }
        return AttributedString(message.text)
    }

    private static func project(_ html: String) -> AttributedString {
        let source = html as NSString
        var result = AttributedString()
        var stack: [Element] = []
        var pendingSpace = false
        var pendingBreaks = 0

        func append(_ text: String) {
            let decoded = decode(text)
            let preformatted = stack.contains { $0.name == "pre" }
            let words: String
            if preformatted {
                words = decoded
            } else {
                words = decoded.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            }
            guard !words.isEmpty else {
                pendingSpace = pendingSpace || !decoded.isEmpty
                return
            }
            if !result.characters.isEmpty {
                if pendingBreaks > 0 {
                    result += AttributedString(String(repeating: "\n", count: pendingBreaks))
                } else if pendingSpace || decoded.first?.isWhitespace == true {
                    result += AttributedString(" ")
                }
            }
            pendingSpace = !preformatted && decoded.last?.isWhitespace == true
            pendingBreaks = 0
            var run = AttributedString(words)
            var intent: InlinePresentationIntent = []
            if stack.contains(where: { strong.contains($0.name) }) { intent.insert(.stronglyEmphasized) }
            if stack.contains(where: { italic.contains($0.name) }) { intent.insert(.emphasized) }
            if stack.contains(where: { $0.name == "code" }) { intent.insert(.code) }
            if !intent.isEmpty { run.inlinePresentationIntent = intent }
            run.link = stack.last(where: { $0.link != nil })?.link
            result += run
        }

        tokens.enumerateMatches(in: html, range: NSRange(location: 0, length: source.length)) { match, _, stop in
            guard let match else { return }
            let token = source.substring(with: match.range)
            if token.hasPrefix("<!") { return }
            let tag = token as NSString
            guard let nameRange = tagName.firstMatch(in: token, range: NSRange(location: 0, length: tag.length))?.range(at: 1) else {
                if !stack.contains(where: \.hidden) { append(token) }
                return
            }
            let name = tag.substring(with: nameRange).lowercased()
            let closing = token.hasPrefix("</")
            if closing {
                let visible = !stack.contains(where: \.hidden)
                if let start = stack.lastIndex(where: { $0.name == name }) { stack.removeSubrange(start...) }
                if visible {
                    if blocks.contains(name) { pendingBreaks = max(pendingBreaks, 2) }
                    if name == "tr" || name == "li" { pendingBreaks = max(pendingBreaks, 1) }
                    if name == "td" || name == "th" { pendingSpace = true }
                }
                return
            }
            if stack.count >= 128 {
                stop.pointee = true
                return
            }
            let isHidden = ignored.contains(name) || hidden.firstMatch(in: token, range: NSRange(location: 0, length: tag.length)) != nil
            if !isHidden && !stack.contains(where: \.hidden) {
                if blocks.contains(name) { pendingBreaks = max(pendingBreaks, 2) }
                if name == "br" || name == "hr" || name == "tr" { pendingBreaks = min(pendingBreaks + 1, 2) }
                if name == "li" {
                    pendingBreaks = max(pendingBreaks, 1)
                    append("• ")
                }
            }
            if !void.contains(name) && !token.hasSuffix("/>") {
                stack.append(Element(name: name, hidden: isHidden, link: name == "a" ? safeLink(token) : nil))
            }
        }
        return result
    }

    private static func safeLink(_ tag: String) -> URL? {
        let source = tag as NSString
        let pairs = attributes.matches(in: tag, range: NSRange(location: 0, length: source.length))
        guard let match = pairs.first(where: { source.substring(with: $0.range(at: 1)).lowercased() == "href" }),
              let capture = (2...4).map({ match.range(at: $0) }).first(where: { $0.location != NSNotFound }) else { return nil }
        let value = decode(source.substring(with: capture)).trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.utf8.count <= 4096, !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
              let url = URLComponents(string: value), url.user == nil, url.password == nil else { return nil }
        switch url.scheme?.lowercased() {
        case "https", "http": return url.host?.isEmpty == false ? url.url : nil
        case "mailto": return url.host == nil && !url.path.isEmpty ? url.url : nil
        default: return nil
        }
    }

    private static func decode(_ text: String) -> String {
        let source = text as NSString
        let result = NSMutableString(string: text)
        for match in entities.matches(in: text, range: NSRange(location: 0, length: source.length)).reversed() {
            let key = source.substring(with: match.range(at: 1))
            var replacement = names[key]
            if key.hasPrefix("#") {
                let hex = key.hasPrefix("#x")
                if let number = UInt32(key.dropFirst(hex ? 2 : 1), radix: hex ? 16 : 10),
                   let scalar = UnicodeScalar(number), number >= 32 {
                    replacement = String(scalar)
                }
            }
            if let replacement { result.replaceCharacters(in: match.range, with: replacement) }
        }
        return result as String
    }
}

struct MailAttachments: View {
    let files: [MailAttachment]
    let service: MailService

    @State private var selected: MailAttachment?
    @State private var document: MailAttachmentDocument?
    @State private var showingExport = false
    @State private var preview: URL?
    @State private var issue: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(files) { file in
                Button {
                    selected = file
                } label: {
                    HStack {
                        Image(systemName: "paperclip").accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: file.filename)
                            Text(ByteCountFormatter.string(fromByteCount: file.size, countStyle: .file))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if selected == file { ProgressView().controlSize(.small) }
                        else { Image(systemName: "arrow.down.circle").accessibilityHidden(true) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(.quaternary, in: .rect(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .disabled(selected != nil)
                .accessibilityHint("Download attachment")
            }
            if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
        }
        .task(id: selected) {
            if let selected { await open(selected) }
        }
        .quickLookPreview($preview)
        .onChange(of: preview) { old, new in
            if let old, new == nil { try? FileManager.default.removeItem(at: old.deletingLastPathComponent()) }
        }
        .fileExporter(
            isPresented: $showingExport, document: document,
            contentType: document?.type ?? .data, defaultFilename: document?.name ?? "Attachment"
        ) { result in
            document = nil
            if case .failure = result { issue = "Couldn’t save the attachment." }
        }
        .onChange(of: showingExport) { _, showing in
            if !showing { document = nil }
        }
    }

    @MainActor
    private func open(_ file: MailAttachment) async {
        issue = nil
        defer { selected = nil }
        do {
            let data = try await service.attachment(file)
            try Task.checkCancellation()
            let name = safeAttachmentName(file.filename)
            let mime = file.type?.lowercased() ?? ""
            let type = UTType(mimeType: mime) ?? .data
            let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
            if Self.previewExtensions[mime]?.contains(ext) == true {
                let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: false)
                let url = dir.appendingPathComponent(name, isDirectory: false)
                do {
                    try data.write(to: url, options: [.atomic, .completeFileProtection])
                    preview = url
                } catch {
                    try? FileManager.default.removeItem(at: dir)
                    throw error
                }
            } else {
                document = MailAttachmentDocument(name: name, type: type, data: data)
                showingExport = true
            }
        } catch {
            if !Task.isCancelled { issue = error.localizedDescription }
        }
    }

    private static let previewExtensions: [String: Set<String>] = [
        "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"],
        "image/gif": ["gif"], "image/heic": ["heic"], "image/webp": ["webp"], "image/bmp": ["bmp"],
        "audio/mpeg": ["mp3"], "audio/mp4": ["m4a"], "video/mp4": ["mp4"], "video/quicktime": ["mov"]
    ]
}

func safeAttachmentName(_ value: String) -> String {
    let components = value.components(separatedBy: CharacterSet(charactersIn: "/\\"))
    let filename = components.last?.components(separatedBy: .controlCharacters).joined() ?? ""
    let name = filename.trimmingCharacters(in: .whitespacesAndNewlines)
    if name.isEmpty || name == "." || name == ".." { return "Attachment" }
    if name.utf8.count <= 240 { return name }
    let path = name as NSString
    let ext = String(path.pathExtension.prefix(10))
    let stem = String(decoding: path.deletingPathExtension.utf8.prefix(192), as: UTF8.self)
    return ext.isEmpty ? stem : "\(stem).\(ext)"
}

private struct MailAttachmentDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    let name: String
    let type: UTType
    let data: Data

    init(name: String, type: UTType, data: Data) {
        self.name = name
        self.type = type
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.init(name: configuration.file.preferredFilename ?? "Attachment", type: configuration.contentType, data: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
