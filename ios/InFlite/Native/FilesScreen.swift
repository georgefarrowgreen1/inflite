import SwiftUI
import UniformTypeIdentifiers

private struct NativeFileEntry: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let kind: String
    let mime: String?
    let size: Int64?
    let status: String

    var isFolder: Bool { kind == "folder" }
}

private struct NativeFilesPage: Decodable {
    let items: [NativeFileEntry]
    let cursor: String?
}

struct NativeFilesView: View {
    let owner: String

    var body: some View {
        NativeFilesFolder(owner: owner, folder: nil)
            .navigationDestination(for: NativeFileEntry.self) { folder in
                NativeFilesFolder(owner: owner, folder: folder)
            }
    }
}

private struct NativeFilesFolder: View {
    let owner: String
    let folder: NativeFileEntry?
    @State private var items: [NativeFileEntry] = []
    @State private var cursor: String?
    @State private var busy = false
    @State private var loaded = false
    @State private var error: String?
    @State private var download: NativeFileEntry?
    @State private var document: NativeFileDocument?
    @State private var export = false

    var body: some View {
        List {
            if let error {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                }
            }
            if items.isEmpty && error == nil {
                if loaded {
                    ContentUnavailableView("Empty folder", systemImage: "folder")
                } else {
                    ProgressView("Loading files")
                }
            }
            ForEach(items) { item in
                if item.isFolder {
                    NavigationLink(value: item) { row(item) }
                } else {
                    Button {
                        download = item
                    } label: {
                        row(item)
                    }
                    .disabled(download != nil || item.status != "ready")
                }
            }
            if let cursor {
                Button("Load more") { Task { await load(after: cursor) } }.disabled(busy)
            }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle(folder?.name ?? "Files")
        .navigationBarTitleDisplayMode(.inline)
        .task { if !loaded { await load() } }
        .refreshable { await load() }
        .task(id: download) {
            if let file = download { await fetch(file) }
        }
        .fileExporter(isPresented: $export, document: document, contentType: document?.type ?? .data,
                      defaultFilename: document?.name ?? "InFlite file") { result in
            if case .failure(let failure) = result { error = failure.localizedDescription }
            download = nil
            document = nil
        }
        .onChange(of: export) { _, showing in
            if !showing { download = nil }
        }
    }

    private func row(_ item: NativeFileEntry) -> some View {
        HStack(spacing: 13) {
            Image(systemName: item.isFolder ? "folder.fill" : "doc")
                .font(.title3).foregroundStyle(NativeStyle.accent)
                .frame(width: 27).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).foregroundStyle(.primary)
                if !item.isFolder, let size = item.size {
                    Text(ByteCountFormatter.string(fromByteCount: size, countStyle: .file))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if download == item { ProgressView().controlSize(.small) }
        }
    }

    @MainActor
    private func load(after next: String? = nil) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        var query = [URLQueryItem(name: "view", value: "folder")]
        if let folder { query.append(.init(name: "parentId", value: folder.id)) }
        if let next { query.append(.init(name: "cursor", value: next)) }
        do {
            let page = try await BackendClient.shared.request(NativeFilesPage.self, path: "/api/files/list", query: query, owner: owner)
            guard !Task.isCancelled else { return }
            if next == nil { items = [] }
            var known = Set(items.map(\.id))
            items += page.items.filter { known.insert($0.id).inserted }
            cursor = page.cursor
            loaded = true
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }

    @MainActor
    private func fetch(_ file: NativeFileEntry) async {
        do {
            let bytes = try await BackendClient.shared.data(
                path: "/api/files/content", query: [.init(name: "id", value: file.id)], owner: owner
            )
            guard !Task.isCancelled else { return }
            let name = (file.name as NSString).lastPathComponent
            let type = file.mime.flatMap { UTType(mimeType: $0) } ?? .data
            document = NativeFileDocument(name: name.isEmpty ? "InFlite file" : name, type: type, data: bytes)
            export = true
        } catch {
            if !Task.isCancelled {
                self.error = error.localizedDescription
                download = nil
            }
        }
    }
}

private struct NativeFileDocument: FileDocument {
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
        self.init(name: configuration.file.preferredFilename ?? "InFlite file", type: configuration.contentType, data: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
