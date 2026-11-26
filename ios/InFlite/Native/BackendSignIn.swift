import CryptoKit
import Security
import SwiftUI
import UIKit
import WebKit

enum BackendSignInPurpose: Sendable {
    case inFlite
    case mail(owner: String)

    var app: String {
        switch self {
        case .inFlite: "today"
        case .mail: "mail"
        }
    }

    var callbackPath: String {
        switch self {
        case .inFlite: "/"
        case .mail: "/mail/"
        }
    }
}

struct BackendHandback: Sendable {
    let url: URL
    let verifier: String

    static func start(purpose: BackendSignInPurpose = .inFlite) throws -> BackendHandback {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, buffer.count, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw BackendError.signInUnavailable }

        let verifier = base64URL(Data(bytes))
        let ask = base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        var parts = URLComponents()
        parts.scheme = "https"
        parts.host = "inflite.ai"
        parts.queryItems = [
            URLQueryItem(name: "signin", value: purpose.app),
            URLQueryItem(name: "ask", value: ask),
            URLQueryItem(name: "back", value: "https://inflite.ai" + purpose.callbackPath)
        ]
        switch purpose {
        case .inFlite: parts.path = "/auth/go"
        case .mail:
            // Mail starts on the sign-in page to confirm the account afresh.
            parts.path = "/auth/"
            parts.percentEncodedFragment = parts.percentEncodedQuery
            parts.queryItems = nil
        }
        guard let url = parts.url else { throw BackendError.signInUnavailable }
        return BackendHandback(url: url, verifier: verifier)
    }

    static func code(from url: URL, purpose: BackendSignInPurpose = .inFlite) -> String? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "https", parts.host == "inflite.ai",
              parts.port == nil || parts.port == 443, parts.user == nil, parts.password == nil,
              parts.percentEncodedPath == purpose.callbackPath, parts.percentEncodedQuery == nil,
              let fragment = parts.percentEncodedFragment,
              let callback = URLComponents(string: "https://inflite.ai/?" + fragment),
              callback.fragment == nil else { return nil }
        let codes = callback.queryItems?.filter { $0.name == "signin" }
        guard codes?.count == 1, let code = codes?.first?.value,
              code.range(of: "^[A-Za-z0-9_-]{20,64}$", options: .regularExpression) != nil else { return nil }
        return code
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

// InFlite's existing identity page owns account verification. Sign-in transfers
// a one-time, verifier-bound code into the native client's separate session.
struct BackendSignInView: View {
    let client: BackendClient
    let purpose: BackendSignInPurpose
    let onComplete: (BackendSession) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var handback: BackendHandback?
    @State private var failure: String?
    @State private var exchange: Task<Void, Never>?
    @State private var loaded = false

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
            ZStack {
                Color(uiColor: .systemBackground).ignoresSafeArea()
                if let failure {
                    ContentUnavailableView {
                        Label("Sign-in unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                    } description: {
                        Text(failure)
                    } actions: {
                        Button("Try again", action: start)
                            .buttonStyle(.borderedProminent)
                    }
                } else if let handback {
                    BackendHostedSignIn(
                        url: handback.url,
                        purpose: purpose,
                        onCode: { redeem($0, verifier: handback.verifier) },
                        onLoad: { loaded = true },
                        onFailure: { failure = BackendError.signInUnavailable.localizedDescription }
                    )
                    .id(handback.url)
                    .opacity(loaded && exchange == nil ? 1 : 0)
                }
                if failure == nil && (!loaded || exchange != nil) {
                    ProgressView(exchange == nil ? "Opening sign-in…" : "Signing in…")
                }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(exchange != nil)
                }
            }
        }
        .task { if handback == nil && failure == nil { start() } }
        .interactiveDismissDisabled(exchange != nil)
        .onDisappear { exchange?.cancel() }
    }

    private func start() {
        exchange?.cancel()
        exchange = nil
        loaded = false
        failure = nil
        do { handback = try BackendHandback.start(purpose: purpose) }
        catch { failure = BackendError.signInUnavailable.localizedDescription }
    }

    private func redeem(_ code: String, verifier: String) {
        guard exchange == nil else { return }
        exchange = Task {
            do {
                let session: BackendSession
                switch purpose {
                case .inFlite:
                    session = try await client.signIn(code: code, verifier: verifier)
                case .mail(let owner):
                    session = try await client.reauthenticateMail(owner: owner, code: code, verifier: verifier)
                }
                try Task.checkCancellation()
                onComplete(session)
                dismiss()
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                failure = (error as? BackendError)?.localizedDescription ?? BackendError.signInUnavailable.localizedDescription
                exchange = nil
            }
        }
    }
}

private struct BackendHostedSignIn: UIViewRepresentable {
    let url: URL
    let purpose: BackendSignInPurpose
    let onCode: (String) -> Void
    let onLoad: () -> Void
    let onFailure: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.navigationDelegate = nil
        webView.stopLoading()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: BackendHostedSignIn
        private var returned = false

        init(_ parent: BackendHostedSignIn) {
            self.parent = parent
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else {
                decisionHandler(.cancel)
                return
            }
            guard action.targetFrame?.isMainFrame ?? true else {
                // Leave embedded identity resources under the authentication page’s CSP.
                decisionHandler(["https", "about"].contains(url.scheme ?? "") ? .allow : .cancel)
                return
            }
            if let code = BackendHandback.code(from: url, purpose: parent.purpose) {
                decisionHandler(.cancel)
                if action.sourceFrame.isMainFrame && !returned {
                    returned = true
                    parent.onCode(code)
                }
                return
            }
            if isIdentityPage(url) && action.targetFrame != nil {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated && url.scheme == "https" {
                UIApplication.shared.open(url)
            } else if action.targetFrame?.isMainFrame == true && !returned {
                parent.onFailure()
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.onLoad()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as? URLError)?.code != .cancelled && !returned { parent.onFailure() }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if (error as? URLError)?.code != .cancelled && !returned { parent.onFailure() }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            if !returned { parent.onFailure() }
        }

        private func isIdentityPage(_ url: URL) -> Bool {
            guard url.scheme == "https", url.user == nil, url.password == nil,
                  url.port == nil || url.port == 443 else { return false }
            switch url.host {
            case "auth.inflite.ai", "account.inflite.ai": return true
            case "inflite.ai": return ["/auth", "/account", "/settings/account"].contains {
                url.path == $0 || url.path.hasPrefix($0 + "/")
            }
            default: return false
            }
        }
    }
}
