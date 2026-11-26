import ImageIO
import PhotosUI
import SwiftUI
import UIKit

struct NativeAccountProfile: Decodable {
    struct Passkey: Decodable, Identifiable {
        let id: String
        let label: String
        let provider: String?
        let rp: String
    }

    struct Device: Decodable, Identifiable {
        let id: String
        let label: String
        let place: String?
        let seenAt: Double
        let current: Bool
    }

    let signedIn: Bool
    let id: String?
    let name: String?
    let handle: String?
    let photoAt: Double?
    let email: String?
    let emailOk: Bool?
    let emailSentAt: Double?
    let emailNew: String?
    let fresh: Bool?
    let salt: String?
    let passkeys: [Passkey]?
    let devices: [Device]?
}

struct NativeAccountService {
    let owner: String

    func profile() async throws -> NativeAccountProfile {
        try await profile("me")
    }

    func profile(_ path: String, method: String = "GET", changes: [String: String]? = nil) async throws -> NativeAccountProfile {
        let updated = try await request(NativeAccountProfile.self, path, method: method, changes: changes)
        guard updated.signedIn else { throw BackendError.authenticationRequired }
        guard updated.id == owner else { throw BackendError.accountChanged }
        return updated
    }

    func request<Value: Decodable>(
        _ type: Value.Type, _ path: String, method: String = "GET", changes: [String: String]? = nil
    ) async throws -> Value {
        let body = try changes.map { try JSONEncoder().encode($0) }
        return try await BackendClient.shared.request(
            type, path: "/api/account/" + path, method: method, body: body, owner: owner, origin: .account
        )
    }

    func photo() async throws -> UIImage {
        let image = try await BackendClient.shared.data(path: "/api/account/me/photo", owner: owner, origin: .account)
        guard let picture = UIImage(data: image) else { throw BackendError.invalidResponse }
        return picture
    }

    func savePhoto(_ data: Data) async throws -> NativeAccountProfile {
        let profile = try await BackendClient.shared.request(
            NativeAccountProfile.self,
            path: "/api/account/me/photo",
            method: "PUT",
            body: data,
            owner: owner,
            origin: .account,
            contentType: "image/jpeg"
        )
        guard profile.signedIn, profile.id == owner else { throw BackendError.accountChanged }
        return profile
    }
}

struct NativeAccountAction: Decodable { let ok: Bool }

@MainActor
struct NativeAccountView: View {
    let user: BackendUser
    @Binding var appearance: String
    let signOut: () -> Void
    var onProfileChange: (NativeAccountProfile) -> Void = { _ in }
    let open: (InFliteRoute) -> Void

    @ObservedObject private var notifications = NativeNotificationStore.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var profile: NativeAccountProfile?
    @State private var photo: UIImage?
    @State private var issue: String?
    @State private var savingAppearance = false
    @State private var signOutPrompt = false

    private var service: NativeAccountService { NativeAccountService(owner: user.id) }
    private var name: String { profile?.name ?? user.name }
    private var unread: Int { notifications.unread(for: user.id) }
    private var photoAt: Double? {
        if let profile { return profile.photoAt }
        return user.photoAt
    }

    var body: some View {
        List {
            Section {
                NavigationLink {
                    NativeAccountProfileView(service: service, initial: profile) { value in
                        profile = value
                        onProfileChange(value)
                    }
                } label: {
                    HStack(spacing: 13) {
                        NativeProfileImage(name: name, photo: photo, diameter: 50)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(name).font(.headline)
                            if let handle = profile?.handle ?? user.handle {
                                Text("@\(handle)").foregroundStyle(.secondary)
                            } else {
                                Text("Profile").foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                NavigationLink {
                    NativeAccountSecurityView(owner: user.id, onDeleted: signOut)
                } label: {
                    Label("Sign-in and Security", systemImage: "shield")
                }
            }
            Section("Notifications") {
                Button {
                    open(.notifications)
                } label: {
                    HStack {
                        Label("Notification inbox", systemImage: "bell")
                        Spacer()
                        NativeNotificationBadge(count: unread)
                    }
                    .foregroundStyle(.primary)
                }
                .accessibilityValue(unread == 0 ? "No unread notifications" : "\(unread) unread")
                NavigationLink {
                    NativeNotificationSettingsView(owner: user.id)
                } label: {
                    Label("Notification settings", systemImage: "slider.horizontal.3")
                }
            }
            Section("Appearance") {
                Picker("Theme", selection: Binding {
                    appearance
                } set: { updateAppearance($0) }) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .disabled(savingAppearance)
            }
            Section("InFlite") {
                Button("About InFlite", systemImage: "info.circle") { open(.about) }
                Button("Contact Us", systemImage: "envelope") { open(.support) }
                Button("Privacy notice", systemImage: "hand.raised") { open(.privacy) }
                Button("Cookies and device storage", systemImage: "internaldrive") { open(.storage) }
                Button("Terms of use", systemImage: "doc.text") { open(.terms) }
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            }
            if let issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    Button("Refresh account") { Task { await load() } }
                }
            }
            Section {
                Button("Sign out", role: .destructive) { signOutPrompt = true }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Settings")
        .task { await load() }
        .task(id: photoAt) {
            photo = nil
            if photoAt != nil {
                photo = try? await service.photo()
            }
        }
        .task(id: scenePhase) {
            if scenePhase == .active { await notifications.refresh(owner: user.id) }
        }
        .refreshable { await load() }
        .confirmationDialog("Sign out of InFlite?", isPresented: $signOutPrompt, titleVisibility: .visible) {
            Button("Sign out", role: .destructive, action: signOut)
        }
    }

    private func load() async {
        do {
            profile = try await service.profile()
            issue = nil
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func updateAppearance(_ value: String) {
        guard !savingAppearance, appearance != value else { return }
        let previous = appearance
        appearance = value
        savingAppearance = true
        Task {
            defer { savingAppearance = false }
            do {
                profile = try await service.profile("prefs", method: "PUT", changes: ["appearance": value == "system" ? "auto" : value])
                issue = nil
            } catch {
                appearance = previous
                issue = "Couldn’t save the theme. \(error.localizedDescription)"
            }
        }
    }
}

struct NativeNotificationBadge: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count > 99 ? "99+" : String(count))
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .frame(minWidth: 19, minHeight: 19)
                .background(.red, in: .capsule)
                .accessibilityHidden(true)
        }
    }
}

private struct NativeProfileImage: View {
    let name: String
    let photo: UIImage?
    let diameter: CGFloat

    var body: some View {
        Group {
            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: diameter * 0.38, weight: .semibold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(NativeStyle.accent.opacity(0.20))
            }
        }
        .frame(width: diameter, height: diameter)
        .clipShape(.circle)
        .accessibilityHidden(true)
    }
}

@MainActor
private struct NativeAccountProfileView: View {
    enum Field: String, Identifiable {
        case name, handle

        var id: String { rawValue }
        var title: String { self == .name ? "Name" : "Handle" }
    }

    let service: NativeAccountService
    let initial: NativeAccountProfile?
    let onChange: (NativeAccountProfile) -> Void
    @State private var loaded: NativeAccountProfile?
    @State private var photo: UIImage?
    @State private var photoSelection: PhotosPickerItem?
    @State private var removingPhoto = false
    @State private var busy = false
    @State private var issue: String?
    @State private var status: String?
    @State private var editing: Field?

    private var profile: NativeAccountProfile? { loaded ?? initial }

    var body: some View {
        Form {
            if let profile {
                Section {
                    HStack(spacing: 14) {
                        NativeProfileImage(name: profile.name ?? "InFlite", photo: photo, diameter: 58)
                        VStack(alignment: .leading, spacing: 8) {
                            PhotosPicker(selection: $photoSelection, matching: .images) {
                                Text(profile.photoAt == nil ? "Add photo" : "Change photo")
                            }
                            if profile.photoAt != nil {
                                Button("Remove photo", role: .destructive) { removingPhoto = true }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section("Profile") {
                    Button { editing = .name } label: {
                        LabeledContent("Name", value: profile.name ?? "")
                    }
                    Button { editing = .handle } label: {
                        LabeledContent("Handle", value: profile.handle.map { "@" + $0 } ?? "")
                    }
                }
                if let email = profile.email {
                    Section("Email") {
                        LabeledContent("Email address", value: email)
                        if profile.emailOk == true {
                            Label("Verified", systemImage: "checkmark.seal").foregroundStyle(.secondary)
                        } else {
                            Button(profile.emailSentAt == nil ? "Send verification email" : "Resend verification email") {
                                Task { await verifyEmail() }
                            }
                        }
                    }
                }
            } else if issue == nil {
                ProgressView("Loading profile")
            }
            if let status {
                Section { Text(status).foregroundStyle(.secondary) }
            }
            if let issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    Button("Refresh profile") { Task { await reload() } }
                }
            }
        }
        .disabled(busy)
        .scrollContentBackground(.hidden)
        .navigationTitle("Profile")
        .refreshable { await reload() }
        .task { await reload() }
        .task(id: profile?.photoAt) {
            photo = nil
            if profile?.photoAt != nil { photo = try? await service.photo() }
        }
        .task(id: photoSelection) {
            guard let selection = photoSelection else { return }
            await upload(selection)
        }
        .sheet(item: $editing) { field in
            let original = field == .name ? profile?.name : profile?.handle
            NativeAccountFieldEdit(service: service, field: field, original: original ?? "") { apply($0) }
                .nativeSheetChrome()
        }
        .confirmationDialog("Remove your profile photo?", isPresented: $removingPhoto, titleVisibility: .visible) {
            Button("Remove photo", role: .destructive) { Task { await removePhoto() } }
        }
    }

    private func apply(_ profile: NativeAccountProfile) {
        loaded = profile
        onChange(profile)
        issue = nil
    }

    private func reload() async {
        guard !busy else { return }
        do {
            apply(try await service.profile())
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func upload(_ selection: PhotosPickerItem) async {
        guard !busy else { return }
        busy = true
        defer {
            busy = false
            photoSelection = nil
        }
        do {
            guard let source = try await selection.loadTransferable(type: Data.self),
                  let image = await Self.avatarJPEG(source) else {
                issue = "Choose a photo that iOS can open."
                return
            }
            apply(try await service.savePhoto(image))
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func removePhoto() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            apply(try await service.profile("me/photo", method: "DELETE"))
        } catch {
            issue = error.localizedDescription
        }
    }

    private func verifyEmail() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let response = try await service.request(NativeAccountAction.self, "email/confirm-send", method: "POST")
            guard response.ok else { throw BackendError.invalidResponse }
            apply(try await service.profile())
            status = loaded?.emailOk == true ? "Email address verified." : "Check your email for the verification link."
        } catch {
            issue = error.localizedDescription
        }
    }

    private nonisolated static func avatarJPEG(_ original: Data) async -> Data? {
        guard let source = CGImageSourceCreateWithData(original as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 512
              ] as CFDictionary) else { return nil }
        let size = min(thumbnail.width, thumbnail.height)
        let area = CGRect(
            x: CGFloat((thumbnail.width - size) / 2),
            y: CGFloat((thumbnail.height - size) / 2),
            width: CGFloat(size),
            height: CGFloat(size)
        )
        guard let square = thumbnail.cropping(to: area) else { return nil }
        return UIImage(cgImage: square).jpegData(compressionQuality: 0.83)
    }
}

@MainActor
private struct NativeAccountFieldEdit: View {
    let service: NativeAccountService
    let field: NativeAccountProfileView.Field
    let original: String
    let onSave: (NativeAccountProfile) -> Void
    @State private var value = ""
    @State private var issue: String?
    @State private var saving = false
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(field.title, text: $value)
                        .textInputAutocapitalization(field == .handle ? .never : .words)
                        .autocorrectionDisabled(field == .handle)
                        .focused($focused)
                } footer: {
                    if field == .handle { Text("Use 3 to 20 letters, numbers or underscores.") }
                }
                if let issue {
                    Section { Label(issue, systemImage: "exclamationmark.circle") }
                }
            }
            .navigationTitle(field.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(saving || value == original || value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .interactiveDismissDisabled(saving)
            .onAppear {
                value = original
                focused = true
            }
        }
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let profile = try await service.profile("me/profile", method: "PATCH", changes: [field.rawValue: value])
            onSave(profile)
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
