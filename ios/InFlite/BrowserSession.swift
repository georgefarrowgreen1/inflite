import SwiftUI
import UIKit
import WebKit

@MainActor
final class BrowserSession: NSObject, ObservableObject {
    enum Phase: Equatable {
        case opening, ready, unavailable(Problem)
    }

    enum Problem: Equatable {
        case offline, service, interrupted

        var title: String {
            switch self {
            case .offline: "You’re offline"
            case .service: "InFlite is unavailable"
            case .interrupted: "Couldn’t open InFlite"
            }
        }

        var message: String {
            switch self {
            case .offline: "Check your connection and try again."
            case .service: "Try again or check InFlite Status."
            case .interrupted: "Open the page again to continue."
            }
        }
    }

    struct SharedDownload: Identifiable {
        let file: URL
        let folder: URL
        var id: URL { file }
    }

    @Published private(set) var phase: Phase = .opening
    @Published var sharedDownload: SharedDownload?
    @Published var downloadFailed = false
    let webView: WKWebView

    private var started = false
    private var retryURL = InFliteRoute.today.url
    private var navigation: WKNavigation?
    private var destinations: [ObjectIdentifier: SharedDownload] = [:]
    private var finishedDownloads: [SharedDownload] = []
    private var presentedDownload: SharedDownload?

    #if DEBUG
    private let recoveryFixture = ProcessInfo.processInfo.arguments.contains("--ui-test-recovery")
    #endif

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // Keep the production web apps' service-worker cache available inside the app.
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
    }

    func start() {
        guard !started else { return }
        started = true
        #if DEBUG
        if recoveryFixture {
            phase = .unavailable(.offline)
            return
        }
        #endif
        load(retryURL)
    }

    func open(_ destination: InFliteRoute) {
        started = true
        load(destination.url)
    }

    func retry() {
        load(retryURL, showOpening: true)
    }

    private func load(_ url: URL, showOpening: Bool = false) {
        retryURL = url
        if showOpening || phase != .ready { phase = .opening }
        #if DEBUG
        if recoveryFixture {
            navigation = webView.loadHTMLString(
                "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><h1>InFlite beta fixture</h1></body></html>",
                baseURL: nil
            )
            return
        }
        #endif
        navigation = webView.load(URLRequest(url: url))
    }

    func clearSharedDownload() {
        if let presentedDownload { remove(presentedDownload) }
        presentedDownload = nil
        presentNextDownload()
    }

    private func presentNextDownload() {
        guard presentedDownload == nil, !finishedDownloads.isEmpty else { return }
        let next = finishedDownloads.removeFirst()
        presentedDownload = next
        sharedDownload = next
    }

    private func remove(_ item: SharedDownload) {
        try? FileManager.default.removeItem(at: item.folder)
    }
}

extension BrowserSession: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }

        let source = action.sourceFrame.securityOrigin
        let trustedSource = NavigationPolicy.owns(
            scheme: source.protocol, host: source.host, port: source.port == 0 ? nil : source.port
        )
        if action.shouldPerformDownload && trustedSource && NavigationPolicy.canDownload(url) {
            decisionHandler(.download)
            return
        }

        #if DEBUG
        if recoveryFixture && url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }
        #endif
        // A new window is treated as top-level and uses the same app session.
        let topLevel = action.targetFrame?.isMainFrame ?? true
        switch NavigationPolicy.decide(
            url, topLevel: topLevel,
            userFollowedLink: action.navigationType == .linkActivated,
            trustedSource: trustedSource
        ) {
        case .inside:
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                navigation = webView.load(action.request)
            } else {
                if topLevel && NavigationPolicy.owns(url) { retryURL = url }
                decisionHandler(.allow)
            }
        case .system:
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        case .block:
            decisionHandler(.cancel)
            if topLevel && phase == .opening { phase = .unavailable(.interrupted) }
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if response.isForMainFrame, let http = response.response as? HTTPURLResponse,
           (500...599).contains(http.statusCode), phase == .opening {
            phase = .unavailable(.service)
            decisionHandler(.cancel)
            return
        }
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
        let attachment = disposition?.split(separator: ";", maxSplits: 1).first.map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        } == "attachment"
        if !response.canShowMIMEType || attachment {
            decisionHandler(response.response.url.map(NavigationPolicy.canDownload) == true ? .download : .cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation current: WKNavigation!) {
        if let current { navigation = current }
    }

    func webView(_ webView: WKWebView, didCommit current: WKNavigation!) {
        if current === navigation { phase = .ready }
    }

    func webView(_ webView: WKWebView, didFinish current: WKNavigation!) {
        guard current === navigation else { return }
        phase = .ready
        if let url = webView.url, NavigationPolicy.owns(url) { retryURL = url }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation current: WKNavigation!, withError error: Error) {
        failed(current, error: error)
    }

    func webView(_ webView: WKWebView, didFail current: WKNavigation!, withError error: Error) {
        failed(current, error: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if let url = webView.url, NavigationPolicy.owns(url) { retryURL = url }
        phase = .unavailable(.interrupted)
    }

    private func failed(_ failedNavigation: WKNavigation?, error: Error) {
        guard failedNavigation === navigation else { return }
        if let urlError = error as? URLError {
            if urlError.code == .cancelled { return }
            if [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed].contains(urlError.code) {
                phase = .unavailable(.offline)
                return
            }
        }
        phase = .unavailable(.interrupted)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
}

extension BrowserSession: WKDownloadDelegate {
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        guard let url = response.url, NavigationPolicy.canDownload(url) else {
            completionHandler(nil)
            return
        }
        let name = (suggestedFilename.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let filename = name.isEmpty || name == "." || name == ".." ? "InFlite download" : name
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
            let file = folder.appendingPathComponent(filename)
            destinations[ObjectIdentifier(download)] = SharedDownload(file: file, folder: folder)
            completionHandler(file)
        } catch {
            downloadFailed = true
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let item = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        finishedDownloads.append(item)
        presentNextDownload()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let item = destinations.removeValue(forKey: ObjectIdentifier(download)) { remove(item) }
        downloadFailed = true
    }
}

struct WebSurface: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct DownloadShareSheet: UIViewControllerRepresentable {
    let file: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [file], applicationActivities: nil)
    }
    func updateUIViewController(_ viewController: UIActivityViewController, context: Context) {}
}
