import AuthenticationServices
import CryptoKit
import SwiftUI

struct NativePasswordResetLink: Identifiable {
    let id = UUID()
    fileprivate let token: String

    init?(url: URL) {
        guard let token = BackendIdentityLink.secret(from: url, key: "reset", length: 43) else { return nil }
        self.token = token
    }
}

struct NativePasswordResetDetails: Decodable {
    struct RecoveryKey: Decodable {
        let id: String
        let rp: String
        let vault: String
    }

    let name: String
    let email: String
    let passkeys: [RecoveryKey]
    let kx: NativeResetPublicKey?

    var recoveryDomains: [String] {
        ["inflite.ai", "georgefarrowgreen.com"].filter { domain in
            passkeys.contains { $0.rp == domain }
        }
    }
}

struct NativeResetPublicKey: Codable {
    let kty: String
    let crv: String
    let x: String
    let y: String

    init(_ key: P256.KeyAgreement.PublicKey) {
        let data = key.x963Representation
        kty = "EC"
        crv = "P-256"
        x = Data(data.dropFirst().prefix(32)).authenticationBase64URL
        y = Data(data.suffix(32)).authenticationBase64URL
    }

    func publicKey() throws -> P256.KeyAgreement.PublicKey {
        guard kty == "EC", crv == "P-256",
              let x = Data(authenticationBase64URL: x), x.count == 32,
              let y = Data(authenticationBase64URL: y), y.count == 32 else {
            throw BackendError.invalidResponse
        }
        return try P256.KeyAgreement.PublicKey(x963Representation: Data([4]) + x + y)
    }
}

struct NativePasswordResetSubmission: Encodable {
    let token: String
    let salt: String
    let proof: String
    let vault: String
    let pub: NativeResetPublicKey?
    let keyProof: String?
}

@MainActor
struct NativePasswordResetView: View {
    let link: NativePasswordResetLink
    let client: BackendClient?
    let onSignIn: ((BackendSession) -> Void)?
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var details: NativePasswordResetDetails?
    @State private var password = ""
    @State private var confirmation = ""
    @State private var working: Task<Void, Never>?
    @State private var confirmingFresh = false
    @State private var completed = false
    @State private var restoredSession: BackendSession?
    @State private var issue: String?

    private let identity = BackendIdentityService()

    init(
        link: NativePasswordResetLink, client: BackendClient? = nil,
        onSignIn: ((BackendSession) -> Void)? = nil, onComplete: @escaping () -> Void = {}
    ) {
        self.link = link
        self.client = client
        self.onSignIn = onSignIn
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            Form {
                if completed {
                    Section {
                        Label("Password changed", systemImage: "checkmark.circle")
                        Button("Done", action: finish)
                    } footer: {
                        Text("Your other devices were signed out. Set up a passkey again in Sign-in and Security.")
                    }
                } else if let details {
                    resetForm(details)
                } else if let issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.circle")
                        Button("Try again") { fetch() }
                    }
                } else {
                    ProgressView("Checking reset link")
                }
            }
            .navigationTitle("Choose a new password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !completed { Button("Cancel") { dismiss() }.disabled(working != nil && details != nil) }
                }
            }
        }
        .interactiveDismissDisabled(working != nil && details != nil)
        .confirmationDialog("Reset password and start fresh?", isPresented: $confirmingFresh, titleVisibility: .visible) {
            Button("Reset and replace Chat key", role: .destructive) { save() }
        } message: {
            Text("Your contacts stay. Older Chat messages and encrypted pins will become unreadable. All devices will be signed out and your passkeys removed.")
        }
        .task { if details == nil && issue == nil { fetch() } }
        .onDisappear {
            working?.cancel()
            password = ""
            confirmation = ""
        }
    }

    private func resetForm(_ details: NativePasswordResetDetails) -> some View {
        Group {
            Section {
                LabeledContent("Account", value: details.name)
                LabeledContent("Email", value: details.email)
            }
            Section {
                SecureField("New password", text: $password)
                    .textContentType(.newPassword)
                SecureField("Confirm password", text: $confirmation)
                    .textContentType(.newPassword)
            } footer: {
                Text("Use at least 15 characters. Resetting signs out your other devices and removes existing passkeys.")
            }
            Section {
                if #available(iOS 18.0, *) {
                    ForEach(details.recoveryDomains, id: \.self) { domain in
                        Button(domain == "inflite.ai" ? "Keep Chat messages with a passkey" : "Keep Chat messages with a legacy passkey") {
                            save(recoveryDomain: domain)
                        }
                        .disabled(!canSave)
                    }
                }
                Button("Start fresh", role: .destructive) { confirmingFresh = true }
                    .disabled(!canSave)
            }
            if let issue { Section { Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary) } }
            if working != nil { Section { ProgressView("Changing password") } }
        }
    }

    private var canSave: Bool {
        working == nil && password.utf16.count >= 15 && password == confirmation
    }

    private func fetch() {
        guard working == nil else { return }
        issue = nil
        working = Task {
            defer { working = nil }
            do {
                details = try await identity.checkPasswordReset(token: link.token)
            } catch is CancellationError {
                return
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func save(recoveryDomain: String? = nil) {
        guard canSave, let details else { return }
        let chosenPassword = password
        issue = nil
        working = Task {
            defer { working = nil }
            do {
                let key: P256.KeyAgreement.PrivateKey
                let keyProof: String?
                if let recoveryDomain {
                    guard #available(iOS 18.0, *), let serverKey = details.kx else {
                        throw BackendError.invalidResponse
                    }
                    key = try await NativeResetVault.recover(details.passkeys, domain: recoveryDomain)
                    keyProof = try NativeResetVault.proof(key: key, server: serverKey, token: link.token)
                } else {
                    key = P256.KeyAgreement.PrivateKey()
                    keyProof = nil
                }
                let salt = try BackendPassword.newSalt()
                let material = try await BackendPassword.derive(chosenPassword, salt: salt)
                let submission = NativePasswordResetSubmission(
                    token: link.token,
                    salt: salt,
                    proof: material.proof,
                    vault: try NativeResetVault.lock(key: key, lockKey: material.lockKey),
                    pub: keyProof == nil ? NativeResetPublicKey(key.publicKey) : nil,
                    keyProof: keyProof
                )
                let authentication = try await identity.completePasswordReset(submission)
                if let client, let challenge = try? BackendHandback.start() {
                    if let code = try? await identity.handback(for: .inFlite, authentication: authentication, challenge: challenge) {
                        restoredSession = try? await client.signIn(code: code, verifier: challenge.verifier)
                    }
                }
                password = ""
                confirmation = ""
                completed = true
            } catch is CancellationError {
                return
            } catch let error as ASAuthorizationError where error.code == .canceled {
                return
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    private func finish() {
        if let restoredSession { onSignIn?(restoredSession) }
        onComplete()
        dismiss()
    }
}

enum NativeResetVault {
    private struct Envelope: Codable {
        let v: Int
        let iv: String
        let d: String
    }

    private struct Inner: Codable {
        struct PrivateKey: Codable {
            let kty: String
            let crv: String
            let d: String
            let x: String
            let y: String
        }

        let ecdh: PrivateKey
    }

    private static let vaultContext = Data("inflight/vault/v1".utf8)

    static func lock(key: P256.KeyAgreement.PrivateKey, lockKey: Data) throws -> String {
        let pub = NativeResetPublicKey(key.publicKey)
        let privateKey = Inner.PrivateKey(
            kty: pub.kty, crv: pub.crv, d: key.rawRepresentation.authenticationBase64URL, x: pub.x, y: pub.y
        )
        let data = try JSONEncoder().encode(Inner(ecdh: privateKey))
        let box = try AES.GCM.seal(data, using: SymmetricKey(data: lockKey), authenticating: vaultContext)
        let envelope = Envelope(
            v: 1, iv: Data(box.nonce).base64EncodedString(),
            d: (box.ciphertext + box.tag).base64EncodedString()
        )
        return String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self)
    }

    static func proof(key: P256.KeyAgreement.PrivateKey, server: NativeResetPublicKey, token: String) throws -> String {
        let shared = try key.sharedSecretFromKeyAgreement(with: server.publicKey())
        let hmacKey = shared.withUnsafeBytes { SymmetricKey(data: Data($0)) }
        let digest = SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
        let message = Data("inflight/key-proof/v1|reset|\(digest)".utf8)
        return Data(HMAC<SHA256>.authenticationCode(for: message, using: hmacKey)).authenticationBase64URL
    }

    @available(iOS 18.0, *)
    @MainActor
    static func recover(_ passkeys: [NativePasswordResetDetails.RecoveryKey], domain: String) async throws -> P256.KeyAgreement.PrivateKey {
        let candidates = passkeys.filter { $0.rp == domain }
        let credentials = candidates.compactMap { Data(authenticationBase64URL: $0.id) }
        guard !credentials.isEmpty else { throw BackendError.invalidResponse }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: domain)
        let request = provider.createCredentialAssertionRequest(challenge: try BackendHandback.randomBytes())
        request.allowedCredentials = credentials.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        request.userVerificationPreference = .required
        let salt = Data(SHA256.hash(data: Data("inflight/prf/v1".utf8)))
        request.prf = .inputValues(.init(saltInput1: salt))
        let controller = NativePasskeyController()
        guard let assertion = try await controller.authorize(request) as? ASAuthorizationPlatformPublicKeyCredentialAssertion,
              let secret = assertion.prf?.first,
              let vault = candidates.first(where: { $0.id == assertion.credentialID.authenticationBase64URL })?.vault else {
            throw BackendError.http(status: 400, message: "This passkey couldn’t open your Chat messages.")
        }
        let vaultKey = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: secret,
            salt: Data(count: 32),
            info: Data("inflight/passkey-vault/v1".utf8),
            outputByteCount: 32
        )
        let envelope = try JSONDecoder().decode(Envelope.self, from: Data(vault.utf8))
        guard envelope.v == 1, let iv = Data(base64Encoded: envelope.iv), iv.count == 12,
              let encrypted = Data(base64Encoded: envelope.d), encrypted.count > 16 else {
            throw BackendError.invalidResponse
        }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: encrypted.dropLast(16), tag: encrypted.suffix(16))
        let unpacked = try AES.GCM.open(box, using: vaultKey, authenticating: vaultContext)
        let jwk = try JSONDecoder().decode(Inner.self, from: unpacked).ecdh
        guard jwk.kty == "EC", jwk.crv == "P-256",
              let scalar = Data(authenticationBase64URL: jwk.d), scalar.count == 32 else {
            throw BackendError.invalidResponse
        }
        return try P256.KeyAgreement.PrivateKey(rawRepresentation: scalar)
    }
}
