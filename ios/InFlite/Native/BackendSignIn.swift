import AuthenticationServices
import CommonCrypto
import CryptoKit
import InFliteArgon2
import Security
import SwiftUI
import UIKit

enum BackendSignInPurpose: Sendable {
    case inFlite
    case mail(owner: String)

    var app: String {
        switch self {
        case .inFlite: "today"
        case .mail: "mail"
        }
    }

    var title: String {
        switch self {
        case .inFlite: "Sign in"
        case .mail: "Verify identity"
        }
    }
}

struct BackendHandback: Sendable {
    let verifier: String

    var challenge: String {
        Data(SHA256.hash(data: Data(verifier.utf8))).authenticationBase64URL
    }

    static func start() throws -> BackendHandback {
        var bytes = Data(count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw BackendError.signInUnavailable }

        return BackendHandback(verifier: bytes.authenticationBase64URL)
    }
}

enum BackendIdentityLink {
    static func secret(from url: URL, key: String, length: Int) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.user == nil, parts.password == nil,
              parts.port == nil || parts.port == 443, parts.percentEncodedQuery == nil,
              let fragment = parts.percentEncodedFragment,
              fragment.hasPrefix(key + "=") else { return nil }
        switch parts.host {
        case "inflite.ai" where ["/auth", "/auth/"].contains(parts.percentEncodedPath): break
        case "auth.inflite.ai" where ["", "/"].contains(parts.percentEncodedPath): break
        default: return nil
        }
        let secret = String(fragment.dropFirst(key.count + 1))
        guard secret.count == length,
              secret.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        return secret
    }
}

struct BackendPasswordMaterial: Sendable {
    let proof: String
    let lockKey: Data
}

enum BackendPassword {
    // The account server stores the salt and only verifies the second half of the
    // derived material. Chat uses the first half on-device to open its key vault.
    static func derive(_ password: String, salt: String) async throws -> BackendPasswordMaterial {
        let usesArgon2 = salt.hasPrefix("a2:")
        let encodedSalt = usesArgon2 ? String(salt.dropFirst(3)) : salt
        guard let saltBytes = Data(authenticationBase64URL: encodedSalt), saltBytes.count == 16,
              !password.isEmpty else { throw BackendError.invalidRequest }

        try Task.checkCancellation()
        let passwordBytes = Data(password.precomposedStringWithCompatibilityMapping.utf8)
        var derived = Data(count: 64)
        let status = derived.withUnsafeMutableBytes { output in
            saltBytes.withUnsafeBytes { knownSalt in
                passwordBytes.withUnsafeBytes { input in
                    if usesArgon2 {
                        return argon2id_hash_raw(
                            3, 65_536, 1, input.baseAddress, input.count,
                            knownSalt.baseAddress, knownSalt.count, output.baseAddress, output.count
                        )
                    }
                    return CCKeyDerivationPBKDF(
                        CCPBKDFAlgorithm(kCCPBKDF2), input.bindMemory(to: CChar.self).baseAddress, input.count,
                        knownSalt.bindMemory(to: UInt8.self).baseAddress, knownSalt.count,
                        CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600_000,
                        output.bindMemory(to: UInt8.self).baseAddress, output.count
                    )
                }
            }
        }
        defer { derived.resetBytes(in: derived.startIndex..<derived.endIndex) }
        try Task.checkCancellation()
        guard status == 0 else { throw BackendError.signInUnavailable }

        return BackendPasswordMaterial(
            proof: Data(derived.suffix(32)).authenticationBase64URL,
            lockKey: Data(derived.prefix(32))
        )
    }
}

extension Data {
    var authenticationBase64URL: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(authenticationBase64URL value: String) {
        guard value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        let padding = (4 - value.count % 4) % 4
        self.init(base64Encoded: value
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/") + String(repeating: "=", count: padding))
    }
}

@MainActor
final class NativePasskeyController: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var window: UIWindow?
    private var controller: ASAuthorizationController?
    private var pending: CheckedContinuation<any ASAuthorizationCredential, Error>?

    func authorize(_ request: ASAuthorizationRequest) async throws -> any ASAuthorizationCredential {
        try Task.checkCancellation()
        guard controller == nil,
              let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })?.keyWindow else {
            throw BackendError.signInUnavailable
        }

        let controller = ASAuthorizationController(authorizationRequests: [request])
        self.window = window
        self.controller = controller
        controller.delegate = self
        controller.presentationContextProvider = self

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                pending = continuation
                if Task.isCancelled {
                    finish(.failure(CancellationError()))
                } else {
                    controller.performRequests()
                }
            }
        } onCancel: {
            Task { @MainActor in
                self.controller?.cancel()
                self.finish(.failure(CancellationError()))
            }
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // The key window is retained from the request through completion.
        window!
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard controller === self.controller else { return }
        finish(.success(authorization.credential))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard controller === self.controller else { return }
        finish(.failure(error))
    }

    private func finish(_ result: Result<any ASAuthorizationCredential, Error>) {
        let continuation = pending
        pending = nil
        controller?.delegate = nil
        controller?.presentationContextProvider = nil
        controller = nil
        window = nil
        continuation?.resume(with: result)
    }
}

private struct IdentityAccount: Decodable {
    let signedIn: Bool
    let id: String?
    let deleting: Bool?
    let deleteAt: Double?
}

private struct IdentityAuthentication {
    let account: IdentityAccount
    let sessionCookie: String
}

private struct BackendIdentityService {
    private enum Endpoint: String {
        case salt = "signin/salt"
        case password = "signin/password"
        case passkeyOptions = "signin/options"
        case passkey = "signin/passkey"
        case handback
        case resetRequest = "reset/request"
        case keepAccount = "delete/cancel"
    }

    private struct Salt: Decodable { let salt: String }
    private struct Options: Decodable { let challenge: String; let rpId: String }
    private struct Code: Decodable { let code: String }
    private struct Failure: Decodable { let error: String }
    private struct Reset: Decodable { let message: String }

    private static let origin = "https://auth.inflite.ai"
    private static let service: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 40
        return URLSession(configuration: configuration, delegate: IdentityNoRedirect(), delegateQueue: nil)
    }()

    func authenticate(
        email: String,
        password: String,
        purpose: BackendSignInPurpose
    ) async throws -> IdentityAuthentication {
        let (salt, _) = try await request(Salt.self, at: .salt, parameters: ["email": email])
        let material = try await BackendPassword.derive(password, salt: salt.salt)
        return try await authenticate(at: .password, parameters: [
            "email": email,
            "proof": material.proof,
            "app": purpose.app
        ])
    }

    @MainActor
    func authenticate(passkey controller: NativePasskeyController, purpose: BackendSignInPurpose) async throws -> IdentityAuthentication {
        let (options, _) = try await request(Options.self, at: .passkeyOptions, parameters: ["rp": "apps"])
        guard options.rpId == "inflite.ai",
              let challenge = Data(authenticationBase64URL: options.challenge), challenge.count == 32 else {
            throw BackendError.invalidResponse
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options.rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required
        let credential = try await controller.authorize(request)
        guard let assertion = credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw BackendError.invalidResponse
        }
        return try await authenticate(at: .passkey, parameters: [
            "challenge": options.challenge,
            "id": assertion.credentialID.authenticationBase64URL,
            "clientDataJSON": assertion.rawClientDataJSON.authenticationBase64URL,
            "authenticatorData": assertion.rawAuthenticatorData.authenticationBase64URL,
            "signature": assertion.signature.authenticationBase64URL,
            "app": purpose.app
        ])
    }

    func handback(
        for purpose: BackendSignInPurpose,
        authentication: IdentityAuthentication,
        challenge: BackendHandback
    ) async throws -> String {
        guard authentication.account.deleting != true else { throw BackendError.authenticationRequired }
        if case .mail(let owner) = purpose, authentication.account.id != owner {
            throw BackendError.accountChanged
        }
        let (reply, _) = try await request(Code.self, at: .handback, parameters: [
            "app": purpose.app, "ask": challenge.challenge
        ], cookie: authentication.sessionCookie)
        return reply.code
    }

    func keepAccount(_ authentication: IdentityAuthentication) async throws -> IdentityAuthentication {
        let (account, _) = try await request(IdentityAccount.self, at: .keepAccount, parameters: [:], cookie: authentication.sessionCookie)
        guard account.signedIn, account.id == authentication.account.id, account.deleting != true else {
            throw BackendError.invalidResponse
        }
        return IdentityAuthentication(account: account, sessionCookie: authentication.sessionCookie)
    }

    func requestPasswordReset(email: String) async throws {
        let (reply, _) = try await request(Reset.self, at: .resetRequest, parameters: ["email": email])
        guard !reply.message.isEmpty else { throw BackendError.invalidResponse }
    }

    private func authenticate(at endpoint: Endpoint, parameters: [String: String]) async throws -> IdentityAuthentication {
        let (account, response) = try await request(IdentityAccount.self, at: endpoint, parameters: parameters)
        guard account.signedIn, let id = account.id, !id.isEmpty, let url = response.url,
              let value = response.value(forHTTPHeaderField: "Set-Cookie") else { throw BackendError.invalidResponse }
        let matched = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": value], for: url)
            .filter { $0.name == "__Secure-account" }
        guard matched.count == 1, let cookie = matched.first,
              [".inflite.ai", "inflite.ai"].contains(cookie.domain.lowercased()),
              cookie.path == "/", cookie.isSecure, cookie.isHTTPOnly,
              cookie.value.range(of: "^[A-Za-z0-9_-]{20,100}$", options: .regularExpression) != nil,
              let expires = cookie.expiresDate, expires > .now else { throw BackendError.invalidResponse }
        return IdentityAuthentication(account: account, sessionCookie: "\(cookie.name)=\(cookie.value); ifl_rw=1")
    }

    private func request<Response: Decodable>(
        _ type: Response.Type,
        at endpoint: Endpoint,
        parameters: [String: String],
        cookie: String? = nil
    ) async throws -> (Response, HTTPURLResponse) {
        let url = URL(string: "\(Self.origin)/api/account/\(endpoint.rawValue)")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue(Self.origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        request.httpBody = try JSONEncoder().encode(parameters)

        let (data, rawResponse) = try await Self.service.data(for: request)
        try Task.checkCancellation()
        guard let response = rawResponse as? HTTPURLResponse, response.url == url,
              data.count <= 1_048_576 else { throw BackendError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = try? JSONDecoder().decode(Failure.self, from: data).error
            throw BackendError.http(status: response.statusCode, message: message.map { String($0.prefix(240)) })
        }
        guard let result = try? JSONDecoder().decode(type, from: data) else { throw BackendError.invalidResponse }
        return (result, response)
    }
}

private final class IdentityNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

struct BackendSignInView: View {
    let client: BackendClient
    let purpose: BackendSignInPurpose
    let onComplete: (BackendSession) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var working: Task<Void, Never>?
    @State private var status: String?
    @State private var pendingDeletion: IdentityAuthentication?
    @State private var resetting = false
    @State private var resetRequested = false
    @FocusState private var field: Field?

    private enum Field { case email, password }
    private let identity = BackendIdentityService()

    init(
        client: BackendClient = .shared,
        purpose: BackendSignInPurpose = .inFlite,
        onComplete: @escaping (BackendSession) -> Void
    ) {
        self.client = client
        self.purpose = purpose
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            Form {
                if let pendingDeletion {
                    deletionSection(pendingDeletion)
                } else if resetting {
                    resetSection
                } else {
                    signInSections
                }
                if let status { Section { Text(status).foregroundStyle(.secondary) } }
                if working != nil { Section { ProgressView() } }
            }
            .navigationTitle(resetting ? "Reset password" : purpose.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if resetting {
                            resetting = false
                            resetRequested = false
                            status = nil
                        } else {
                            dismiss()
                        }
                    }
                    .disabled(working != nil)
                }
            }
        }
        .interactiveDismissDisabled(working != nil)
        .onDisappear {
            working?.cancel()
            password = ""
            pendingDeletion = nil
        }
    }

    private var signInSections: some View {
        Group {
            Section {
                Button {
                    perform {
                        let authentication = try await identity.authenticate(passkey: NativePasskeyController(), purpose: purpose)
                        try await handle(authentication)
                    }
                } label: {
                    Label("Use a passkey", systemImage: "key")
                }
                .accessibilityIdentifier("native-auth-passkey")
                .disabled(working != nil)
            }
            Section {
                emailField
                    .submitLabel(.next)
                    .onSubmit { field = .password }
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .focused($field, equals: .password)
                    .accessibilityIdentifier("native-auth-password")
                    .onSubmit(signInWithPassword)
                Button(purpose.title, action: signInWithPassword)
                    .disabled(working != nil || emailAddress.isEmpty || password.isEmpty)
            } footer: {
                Button("Forgot password?") {
                    password = ""
                    field = nil
                    status = nil
                    resetting = true
                }
                .disabled(working != nil)
            }
        }
    }

    private var emailField: some View {
        TextField("Email address", text: $email)
            .keyboardType(.emailAddress)
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($field, equals: .email)
            .accessibilityIdentifier("native-auth-email")
            .disabled(working != nil)
    }

    private var resetSection: some View {
        Section {
            if resetRequested {
                Label("Check your email", systemImage: "envelope.badge")
            } else {
                emailField
                Button("Email reset link") {
                    let address = emailAddress
                    perform {
                        try await identity.requestPasswordReset(email: address)
                        resetRequested = true
                    }
                }
                .disabled(working != nil || emailAddress.isEmpty)
            }
        } footer: {
            Text(resetRequested
                ? "If this address has an InFlite account, we’ll send a link to reset its password."
                : "Enter the email address for your InFlite account.")
        }
    }

    private func deletionSection(_ authentication: IdentityAuthentication) -> some View {
        Section {
            Label("Account scheduled for deletion", systemImage: "person.crop.circle.badge.exclamationmark")
            if let date = authentication.account.deleteAt {
                LabeledContent("Scheduled date", value: Date(timeIntervalSince1970: date / 1000).formatted(date: .abbreviated, time: .omitted))
            }
            Button("Keep my account") {
                perform {
                    let restored = try await identity.keepAccount(authentication)
                    try await handle(restored)
                }
            }
            .disabled(working != nil)
        } footer: {
            Text("Keeping the account cancels its scheduled deletion.")
        }
    }

    private var emailAddress: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func signInWithPassword() {
        let address = emailAddress
        let enteredPassword = password
        guard working == nil, !address.isEmpty, !enteredPassword.isEmpty else { return }
        password = ""
        perform {
            let authentication = try await identity.authenticate(email: address, password: enteredPassword, purpose: purpose)
            try await handle(authentication)
        }
    }

    private func perform(_ action: @escaping @MainActor () async throws -> Void) {
        guard working == nil else { return }
        field = nil
        status = nil
        working = Task {
            defer { working = nil }
            do {
                try await action()
            } catch is CancellationError {
                return
            } catch let error as ASAuthorizationError where error.code == .canceled {
                return
            } catch is ASAuthorizationError {
                status = "Your passkey couldn’t be used. Try again or sign in with your password."
            } catch {
                guard !Task.isCancelled else { return }
                status = (error as? BackendError)?.localizedDescription ?? BackendError.signInUnavailable.localizedDescription
            }
        }
    }

    private func handle(_ authentication: IdentityAuthentication) async throws {
        try Task.checkCancellation()
        if case .mail(let owner) = purpose, authentication.account.id != owner {
            throw BackendError.accountChanged
        }
        if authentication.account.deleting == true {
            pendingDeletion = authentication
            return
        }
        pendingDeletion = nil
        let challenge = try BackendHandback.start()
        let code = try await identity.handback(for: purpose, authentication: authentication, challenge: challenge)
        let session: BackendSession
        switch purpose {
        case .inFlite:
            session = try await client.signIn(code: code, verifier: challenge.verifier)
        case .mail(let owner):
            session = try await client.reauthenticateMail(owner: owner, code: code, verifier: challenge.verifier)
        }
        try Task.checkCancellation()
        onComplete(session)
        dismiss()
    }
}
