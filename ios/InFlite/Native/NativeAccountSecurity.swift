import AuthenticationServices
import CryptoKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct NativeAccountSecurityView: View {
    private enum Action {
        case addPasskey
        case removePasskey(NativeAccountProfile.Passkey)
        case endSession(NativeAccountProfile.Device)
        case changeEmail(String)
        case export
        case delete(String)
    }

    private struct Verification: Identifiable {
        let id = UUID()
        let profile: NativeAccountProfile
        let action: Action
    }

    let owner: String
    var onDeleted: (() -> Void)? = nil

    @State private var profile: NativeAccountProfile?
    @State private var verification: Verification?
    @State private var verifiedAction: Action?
    @State private var passkeyToRemove: NativeAccountProfile.Passkey?
    @State private var sessionToEnd: NativeAccountProfile.Device?
    @State private var newEmail = ""
    @State private var changeEmailPrompt = false
    @State private var deletionPhrase = ""
    @State private var confirmDeletion = false
    @State private var deleted = false
    @State private var busy = false
    @State private var issue: String?
    @State private var exporting = false
    @State private var download: AccountExportDocument?

    private var service: NativeAccountService { NativeAccountService(owner: owner) }

    var body: some View {
        List {
            if let profile {
                Section("Passkeys") {
                    ForEach(profile.passkeys ?? []) { passkey in
                        Menu {
                            Button("Remove passkey", systemImage: "trash", role: .destructive) {
                                passkeyToRemove = passkey
                            }
                        } label: {
                            HStack {
                                Label(passkey.label, systemImage: "person.badge.key")
                                Spacer()
                                Text(passkey.provider ?? passkey.rp).font(.caption).foregroundStyle(.secondary)
                            }
                            .foregroundStyle(.primary)
                        }
                    }
                    Button("Add a passkey", systemImage: "plus") { start(.addPasskey) }
                }
                if let email = profile.email {
                    Section("Sign-in email") {
                        LabeledContent("Email address", value: email)
                        if let pending = profile.emailNew {
                            LabeledContent("Awaiting verification", value: pending)
                            Button("Cancel email change", role: .destructive) { cancelEmailChange() }
                        }
                        Button("Change email address", systemImage: "envelope") {
                            newEmail = ""
                            changeEmailPrompt = true
                        }
                    }
                }
                Section("Signed-in devices") {
                    ForEach(profile.devices ?? []) { device in
                        if device.current {
                            deviceDetails(device)
                        } else {
                            Menu {
                                Button("Sign out this device", role: .destructive) { sessionToEnd = device }
                            } label: {
                                deviceDetails(device)
                            }
                        }
                    }
                }
                Section {
                    NavigationLink {
                        NativeComputerSignInView(owner: owner)
                    } label: {
                        Label("Sign in on a computer", systemImage: "qrcode.viewfinder")
                    }
                }
                if onDeleted != nil, profile.handle != nil {
                    Section("Account data") {
                        Button("Export account data", systemImage: "square.and.arrow.down") { start(.export) }
                        Button("Delete account", role: .destructive) {
                            deletionPhrase = ""
                            confirmDeletion = true
                        }
                    }
                }
            } else if issue == nil {
                ProgressView("Loading security settings")
            }
            if let issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
                    Button("Refresh security settings") { Task { await reload() } }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Sign-in and Security")
        .disabled(busy || deleted)
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(item: $verification, onDismiss: finishVerification) { request in
            NativeAccountReauthenticationView(service: service, profile: request.profile) {
                verifiedAction = request.action
                verification = nil
            }
        }
        .confirmationDialog("Remove passkey?", isPresented: Binding {
            passkeyToRemove != nil
        } set: { if !$0 { passkeyToRemove = nil } }, titleVisibility: .visible) {
            if let passkey = passkeyToRemove {
                Button("Remove \(passkey.label)", role: .destructive) { start(.removePasskey(passkey)) }
            }
        } message: {
            Text("This passkey will no longer sign in to your InFlite account.")
        }
        .confirmationDialog("Sign out this device?", isPresented: Binding {
            sessionToEnd != nil
        } set: { if !$0 { sessionToEnd = nil } }, titleVisibility: .visible) {
            if let device = sessionToEnd {
                Button("Sign out \(device.label)", role: .destructive) { start(.endSession(device)) }
            }
        }
        .alert("Delete your account?", isPresented: $confirmDeletion) {
            TextField("Your handle", text: $deletionPhrase)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button("Cancel", role: .cancel) {}
            Button("Schedule deletion", role: .destructive) {
                if let handle = profile?.handle, normalizedHandle == handle { start(.delete(handle)) }
            }
            .disabled(normalizedHandle != profile?.handle)
        } message: {
            Text("Type @\(profile?.handle ?? "") to confirm. InFlite signs out every device and deletes the account in seven days.")
        }
        .alert("Change your sign-in email?", isPresented: $changeEmailPrompt) {
            TextField("New email address", text: $newEmail)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button("Cancel", role: .cancel) {}
            Button("Send verification") { start(.changeEmail(newEmail.trimmingCharacters(in: .whitespacesAndNewlines))) }
                .disabled(!newEmail.contains("@"))
        } message: {
            Text("InFlite will send a link to the new address. Your sign-in email changes after you open it.")
        }
        .alert("Account deletion scheduled", isPresented: $deleted) {
            Button("Done") { onDeleted?() }
        } message: {
            Text("Sign in again within seven days if you want to keep your account.")
        }
        .fileExporter(isPresented: $exporting, document: download, contentType: .json, defaultFilename: "InFlite account data") { result in
            if case .failure(let error) = result { issue = error.localizedDescription }
            download = nil
        }
        .onChange(of: exporting) { _, showing in
            if !showing { download = nil }
        }
    }

    private var normalizedHandle: String {
        deletionPhrase.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "@"))
    }

    private func deviceDetails(_ device: NativeAccountProfile.Device) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(device.label)
                if let place = device.place {
                    Text(place).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if device.current {
                Text("This iPhone").font(.caption).foregroundStyle(.secondary)
            } else {
                Text(Date(timeIntervalSince1970: device.seenAt / 1000), style: .relative)
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(.primary)
    }

    private func reload() async {
        guard !busy else { return }
        do {
            profile = try await service.profile()
            issue = nil
        } catch is CancellationError {
        } catch {
            issue = error.localizedDescription
        }
    }

    private func cancelEmailChange() {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                profile = try await service.profile("email/cancel", method: "POST")
                issue = nil
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func start(_ action: Action) {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let current = try await service.profile()
                profile = current
                issue = nil
                if current.fresh == true {
                    try await perform(action)
                } else {
                    verification = Verification(profile: current, action: action)
                }
            } catch is CancellationError {
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func finishVerification() {
        guard let verifiedAction, !busy else { return }
        self.verifiedAction = nil
        busy = true
        Task {
            defer { busy = false }
            do {
                try await perform(verifiedAction)
            } catch is CancellationError {
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func perform(_ action: Action) async throws {
        switch action {
        case .addPasskey:
            profile = try await NativeAccountPasskeys.add(service: service)
        case .removePasskey(let passkey):
            profile = try await service.profile("passkeys/remove", method: "POST", changes: ["id": passkey.id])
        case .endSession(let device):
            let token = try await confirmation("account-devices", target: device.id)
            profile = try await service.profile("devices/end", method: "POST", changes: ["id": device.id, "securityTicket": token])
        case .changeEmail(let email):
            profile = try await service.profile("email/change", method: "POST", changes: ["email": email])
        case .export:
            let token = try await confirmation("account-export", target: owner)
            let body = try JSONEncoder().encode(["securityTicket": token])
            let data = try await BackendClient.shared.data(
                path: "/api/account/export", method: "POST", body: body, owner: owner, origin: .account
            )
            download = AccountExportDocument(data: data)
            exporting = true
        case .delete(let handle):
            let token = try await confirmation("account-delete", target: owner)
            let result = try await service.request(
                NativeAccountAction.self, "delete", method: "POST", changes: ["confirm": handle, "securityTicket": token]
            )
            guard result.ok else { throw BackendError.invalidResponse }
            deleted = true
        }
        issue = nil
    }

    private func confirmation(_ action: String, target: String) async throws -> String {
        struct Ticket: Decodable { let token: String }
        let result = try await service.request(
            Ticket.self, "security/confirmation", method: "POST", changes: ["action": action, "target": target]
        )
        return result.token
    }
}

private struct AccountExportDocument: FileDocument {
    static let readableContentTypes = [UTType.json]
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else { throw BackendError.invalidResponse }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

@MainActor
struct NativeAccountReauthenticationView: View {
    let service: NativeAccountService
    let profile: NativeAccountProfile
    let onVerified: () -> Void

    @State private var password = ""
    @State private var busy = false
    @State private var issue: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit { verifyWithPassword() }
                    Button("Verify with password", action: verifyWithPassword).disabled(password.isEmpty)
                } header: {
                    Text("Confirm it’s you")
                } footer: {
                    Text("Account security changes require a recent sign-in.")
                }
                if !compatiblePasskeys.isEmpty {
                    Section {
                        Button("Use a passkey", systemImage: "person.badge.key") {
                            run { try await NativeAccountPasskeys.assertion(service: service, credentials: compatiblePasskeys) }
                        }
                    }
                }
                if let issue { Section { Label(issue, systemImage: "exclamationmark.circle") } }
            }
            .disabled(busy)
            .navigationTitle("Verify identity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(busy)
                }
            }
            .interactiveDismissDisabled(busy)
        }
    }

    private var compatiblePasskeys: [NativeAccountProfile.Passkey] {
        (profile.passkeys ?? []).filter { $0.rp == "inflite.ai" }
    }

    private func verifyWithPassword() {
        guard !password.isEmpty, let salt = profile.salt else { return }
        let entered = password
        run {
            let material = try await BackendPassword.derive(entered, salt: salt)
            return ["proof": material.proof]
        }
    }

    private func run(_ authentication: @escaping () async throws -> [String: String]) {
        guard !busy else { return }
        busy = true
        Task {
            defer {
                busy = false
                password = ""
            }
            do {
                let proof = try await authentication()
                let result = try await service.request(NativeAccountAction.self, "reauth", method: "POST", changes: proof)
                guard result.ok else { throw BackendError.invalidResponse }
                onVerified()
            } catch is CancellationError {
            } catch let error as ASAuthorizationError where error.code == .canceled {
            } catch {
                issue = error.localizedDescription
            }
        }
    }
}

@MainActor
private enum NativeAccountPasskeys {
    struct AssertionOptions: Decodable { let challenge: String; let rpId: String }
    struct RegistrationOptions: Decodable {
        struct Account: Decodable { let id: String; let name: String; let displayName: String }
        let challenge: String
        let rpId: String
        let user: Account
    }

    struct Registration: Encodable {
        let challenge: String
        let id: String
        let publicKey: String
        let clientDataJSON: String
        let authenticatorData: String
        let alg = -7
    }

    static func assertion(
        service: NativeAccountService, credentials: [NativeAccountProfile.Passkey]
    ) async throws -> [String: String] {
        let options = try await service.request(
            AssertionOptions.self, "signin/options", method: "POST", changes: ["rp": "apps"]
        )
        let ids = credentials.compactMap { decode($0.id) }
        guard options.rpId == "inflite.ai", let challenge = decode(options.challenge), !ids.isEmpty else {
            throw BackendError.invalidResponse
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.allowedCredentials = ids.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        request.userVerificationPreference = .required
        let controller = NativePasskeyController()
        guard let assertion = try await controller.authorize(request) as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw BackendError.invalidResponse
        }
        return [
            "challenge": options.challenge,
            "id": encode(assertion.credentialID),
            "clientDataJSON": encode(assertion.rawClientDataJSON),
            "authenticatorData": encode(assertion.rawAuthenticatorData),
            "signature": encode(assertion.signature)
        ]
    }

    static func add(service: NativeAccountService) async throws -> NativeAccountProfile {
        let options = try await service.request(RegistrationOptions.self, "passkeys/options", method: "POST")
        guard options.rpId == "inflite.ai",
              let challenge = decode(options.challenge), let user = decode(options.user.id),
              user == Data(service.owner.utf8) else {
            throw BackendError.invalidResponse
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: options.user.name, userID: user)
        request.displayName = options.user.displayName
        request.userVerificationPreference = .required
        request.attestationPreference = .none
        let controller = NativePasskeyController()
        guard let credential = try await controller.authorize(request) as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let raw = credential.rawAttestationObject else {
            throw BackendError.invalidResponse
        }
        let attestation = try AccountPasskeyAttestation(raw, credentialID: credential.credentialID)
        let body = try JSONEncoder().encode(Registration(
            challenge: options.challenge,
            id: encode(credential.credentialID),
            publicKey: encode(attestation.publicKey),
            clientDataJSON: encode(credential.rawClientDataJSON),
            authenticatorData: encode(attestation.authenticatorData)
        ))
        let profile = try await BackendClient.shared.request(
            NativeAccountProfile.self, path: "/api/account/passkeys", method: "POST", body: body,
            owner: service.owner, origin: .account
        )
        guard profile.signedIn, profile.id == service.owner else { throw BackendError.accountChanged }
        return profile
    }

    private static func encode(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func decode(_ value: String) -> Data? {
        let encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        return Data(base64Encoded: encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4))
    }
}

private struct AccountPasskeyAttestation {
    let authenticatorData: Data
    let publicKey: Data

    init(_ object: Data, credentialID: Data) throws {
        guard object.count <= 16_384 else { throw BackendError.invalidResponse }
        var envelope = CBORReader(bytes: Array(object))
        let value = try envelope.read()
        guard let data = value.mapValue("authData")?.bytes, data.count >= 55 else {
            throw BackendError.invalidResponse
        }
        let idLength = Int(data[53]) * 256 + Int(data[54])
        let start = 55 + idLength
        guard start < data.count, Data(data[55..<start]) == credentialID else { throw BackendError.invalidResponse }
        var reader = CBORReader(bytes: data, offset: start)
        let cose = try reader.read()
        guard cose.mapValue(1)?.integer == 2, cose.mapValue(3)?.integer == -7,
              cose.mapValue(-1)?.integer == 1,
              let x = cose.mapValue(-2)?.bytes, x.count == 32,
              let y = cose.mapValue(-3)?.bytes, y.count == 32 else {
            throw BackendError.invalidResponse
        }
        let key = try P256.Signing.PublicKey(x963Representation: Data([4] + x + y))
        authenticatorData = Data(data)
        publicKey = key.derRepresentation
    }
}

private struct CBORReader {
    indirect enum Value {
        case ignored
        case integerValue(Int)
        case bytesValue([UInt8])
        case text(String)
        case map([(Value, Value)])

        var integer: Int? {
            if case .integerValue(let value) = self { return value }
            return nil
        }

        var bytes: [UInt8]? {
            if case .bytesValue(let value) = self { return value }
            return nil
        }

        func mapValue(_ key: Int) -> Value? {
            guard case .map(let values) = self else { return nil }
            return values.first { $0.0.integer == key }?.1
        }

        func mapValue(_ key: String) -> Value? {
            guard case .map(let values) = self else { return nil }
            return values.first {
                if case .text(let text) = $0.0 { return text == key }
                return false
            }?.1
        }
    }

    let bytes: [UInt8]
    var offset = 0
    private var budget = 256

    init(bytes: [UInt8], offset: Int = 0) {
        self.bytes = bytes
        self.offset = offset
    }

    mutating func read(depth: Int = 0) throws -> Value {
        guard offset < bytes.count, depth <= 8, budget > 0 else { throw BackendError.invalidResponse }
        budget -= 1
        let header = bytes[offset]
        offset += 1
        let length = try argument(header & 31)
        switch header >> 5 {
        case 0: return .integerValue(length)
        case 1: return .integerValue(-1 - length)
        case 2: return .bytesValue(try take(length))
        case 3: return .text(String(decoding: try take(length), as: UTF8.self))
        case 4:
            guard length <= budget else { throw BackendError.invalidResponse }
            for _ in 0..<length { _ = try read(depth: depth + 1) }
            return .ignored
        case 5:
            guard length <= budget / 2 else { throw BackendError.invalidResponse }
            var pairs: [(Value, Value)] = []
            for _ in 0..<length {
                let key = try read(depth: depth + 1)
                pairs.append((key, try read(depth: depth + 1)))
            }
            return .map(pairs)
        case 7: return .ignored
        default: throw BackendError.invalidResponse
        }
    }

    private mutating func argument(_ value: UInt8) throws -> Int {
        if value < 24 { return Int(value) }
        guard value <= 27 else { throw BackendError.invalidResponse }
        let bytes = try take(1 << Int(value - 24))
        let length = bytes.reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        guard length <= UInt64(Int.max) else { throw BackendError.invalidResponse }
        return Int(length)
    }

    private mutating func take(_ length: Int) throws -> [UInt8] {
        guard length <= bytes.count - offset else { throw BackendError.invalidResponse }
        let end = offset + length
        let value = Array(bytes[offset..<end])
        offset = end
        return value
    }
}
