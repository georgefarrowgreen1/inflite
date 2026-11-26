import SwiftUI

private struct MailPreferences: Decodable {
    let domain: String
    let addresses: [MailAddress]
    let catchall: String
    let signature: String
    let colors: [String]
}

private struct MailAddress: Decodable, Identifiable {
    let email: String
    let name: String
    let color: String
    let category: String?
    let notify: Bool
    let isDefault: Bool
    let signature: String

    var id: String { email }
}

private struct MailPreferenceInput: Encodable {
    let catchall: String
    let signature: String
}

private struct MailAddressInput: Encodable {
    let local: String?
    let name: String
    let color: String
    let category: String
    let notify: Bool
    let isDefault: Bool
    let signature: String

    private enum CodingKeys: String, CodingKey { case local, name, color, category, notify, isDefault, signature }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(local, forKey: .local)
        try values.encode(name, forKey: .name)
        try values.encode(color, forKey: .color)
        if category.isEmpty { try values.encodeNil(forKey: .category) }
        else { try values.encode(category, forKey: .category) }
        try values.encode(notify, forKey: .notify)
        try values.encode(isDefault, forKey: .isDefault)
        try values.encode(signature, forKey: .signature)
    }
}

private struct MailPreferencesService {
    let owner: String

    func load() async throws -> MailPreferences {
        try await BackendClient.shared.request(MailPreferences.self, path: "/api/settings", owner: owner, origin: .mail)
    }

    func save(catchall: String, signature: String) async throws -> MailPreferences {
        let body = try JSONEncoder().encode(MailPreferenceInput(catchall: catchall, signature: signature))
        return try await BackendClient.shared.request(
            MailPreferences.self, path: "/api/settings", method: "PATCH", body: body, owner: owner, origin: .mail
        )
    }

    func save(_ input: MailAddressInput, address: MailAddress?) async throws {
        let path = try address.map { try addressPath($0.email) } ?? "/api/addresses"
        let body = try JSONEncoder().encode(input)
        _ = try await BackendClient.shared.request(
            MailAddress.self, path: path, method: address == nil ? "POST" : "PATCH", body: body, owner: owner, origin: .mail
        )
    }

    func remove(_ address: MailAddress) async throws {
        struct Result: Decodable { let ok: Bool }
        let result = try await BackendClient.shared.request(
            Result.self, path: addressPath(address.email), method: "DELETE", owner: owner, origin: .mail
        )
        guard result.ok else { throw BackendError.invalidResponse }
    }

    private func addressPath(_ email: String) throws -> String {
        guard email.range(of: #"^[A-Za-z0-9._-]{1,64}@[A-Za-z0-9.-]{1,253}$"#, options: .regularExpression) != nil
        else { throw BackendError.invalidRequest }
        return "/api/addresses/\(email)"
    }
}

@MainActor
struct MailSettingsView: View {
    let owner: String

    private struct Editor: Identifiable {
        let address: MailAddress?
        var id: String { address?.email ?? "new" }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var preferences: MailPreferences?
    @State private var catchall = "keep"
    @State private var signature = ""
    @State private var editor: Editor?
    @State private var busy = false
    @State private var issue: String?

    private var service: MailPreferencesService { MailPreferencesService(owner: owner) }

    var body: some View {
        NavigationStack {
            Form {
                if let preferences {
                    Section("Addresses") {
                        ForEach(preferences.addresses) { address in
                            Button {
                                editor = Editor(address: address)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        if !address.name.isEmpty { Text(verbatim: address.name) }
                                        Text(verbatim: address.email)
                                            .foregroundStyle(address.name.isEmpty ? Color.primary : Color.secondary)
                                    }
                                    Spacer()
                                    if address.isDefault {
                                        Text("Default").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Image(systemName: "chevron.forward").font(.caption).foregroundStyle(.secondary)
                                }
                                .foregroundStyle(.primary)
                            }
                        }
                        Button("Add Address", systemImage: "plus") { editor = Editor(address: nil) }
                    }
                    Section("Incoming mail") {
                        Picker("Unlisted addresses", selection: $catchall) {
                            Text("Keep mail").tag("keep")
                            Text("Turn away mail").tag("reject")
                        }
                    }
                    Section("Default signature") {
                        TextEditor(text: $signature)
                            .frame(minHeight: 80)
                            .accessibilityLabel("Default signature")
                    }
                } else if issue == nil {
                    ProgressView("Loading Mail settings")
                } else {
                    Button("Try Again") { Task { await load() } }.disabled(busy)
                }
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
            }
            .disabled(busy)
            .navigationTitle("Mail Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { NativeSheetCloseButton { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    if let preferences {
                        Button("Save") { Task { await save() } }
                            .disabled(busy || (catchall == preferences.catchall && signature == preferences.signature))
                    }
                }
            }
            .privacySensitive()
            .task { await load() }
            .sheet(item: $editor, onDismiss: { Task { await load() } }) { editor in
                if let preferences {
                    MailAddressEditor(service: service, domain: preferences.domain, colors: preferences.colors, address: editor.address)
                }
            }
        }
    }

    private func load() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await service.load()
            try Task.checkCancellation()
            if preferences == nil {
                catchall = result.catchall
                signature = result.signature
            }
            preferences = result
            issue = nil
        } catch {
            if !Task.isCancelled { issue = error.localizedDescription }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await service.save(catchall: catchall, signature: signature)
            preferences = result
            catchall = result.catchall
            signature = result.signature
            issue = nil
        } catch {
            issue = error.localizedDescription
        }
    }
}

@MainActor
private struct MailAddressEditor: View {
    let service: MailPreferencesService
    let domain: String
    let colors: [String]
    let address: MailAddress?

    @Environment(\.dismiss) private var dismiss
    @State private var local = ""
    @State private var name = ""
    @State private var color = "blue"
    @State private var category = ""
    @State private var notify = true
    @State private var isDefault = false
    @State private var signature = ""
    @State private var busy = false
    @State private var confirmingDelete = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let address {
                        LabeledContent("Address", value: address.email)
                    } else {
                        HStack {
                            TextField("Address", text: $local)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.emailAddress)
                            Text("@\(domain)").foregroundStyle(.secondary)
                        }
                    }
                    TextField("Display Name", text: $name)
                    Picker("Colour", selection: $color) {
                        ForEach(colors, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                    Picker("Mailbox", selection: $category) {
                        Text("Automatic").tag("")
                        Text("People").tag("people")
                        Text("Updates").tag("updates")
                    }
                    Toggle("Notifications", isOn: $notify)
                    if let address {
                        Toggle("Default sender", isOn: $isDefault).disabled(address.isDefault)
                    }
                }
                Section("Signature") {
                    TextEditor(text: $signature)
                        .frame(minHeight: 80)
                        .accessibilityLabel("Signature")
                }
                if let address, !address.isDefault {
                    Button("Remove Address", role: .destructive) { confirmingDelete = true }
                }
                if let issue { Text(issue).font(.footnote).foregroundStyle(.secondary) }
            }
            .disabled(busy)
            .navigationTitle(address == nil ? "Add Address" : "Edit Address")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(busy)
            .privacySensitive()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || (address == nil && local.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                }
            }
            .confirmationDialog("Remove this address?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Remove Address", role: .destructive) { Task { await remove() } }
            } message: {
                Text("Existing messages stay in Mail. Future messages follow your setting for unlisted addresses.")
            }
            .task {
                name = address?.name ?? ""
                color = address?.color ?? colors.first ?? "blue"
                category = address?.category ?? ""
                notify = address?.notify ?? true
                isDefault = address?.isDefault ?? false
                signature = address?.signature ?? ""
            }
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let input = MailAddressInput(local: address == nil ? local : nil, name: name, color: color, category: category,
                                         notify: notify, isDefault: isDefault, signature: signature)
            try await service.save(input, address: address)
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }

    private func remove() async {
        guard let address, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await service.remove(address)
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
