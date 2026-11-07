import AppKit
import SwiftUI
import WebKit
import InFliteCore

@MainActor
final class BrowserPage: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var onNavigationFinished: (() -> Void)?
    let id = UUID()
    let homeURL: URL
    let webView: WKWebView
    @Published var isLoading = false
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var location = ""
    @Published var error: String?
    private var observations: [NSKeyValueObservation] = []
    private var activeDownloads: [WKDownload] = []
    private var mainStatus: Int?

    init(url: URL) {
        homeURL = url
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = .windowBackgroundColor
        observations = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.isLoading = view.isLoading }
            },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoBack = view.canGoBack }
            },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoForward = view.canGoForward }
            },
            webView.observe(\.url, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.location = view.url?.host ?? "" }
            }
        ]
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        // Subframes keep WebKit's origin protections. Top-level app navigation stays on exact, known hosts.
        if action.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if action.shouldPerformDownload,
           NavigationPolicy.isInternal(url) || (url.scheme == "blob" && webView.url.map(NavigationPolicy.isInternal) == true) {
            decisionHandler(.download)
        } else if NavigationPolicy.isInternal(url) {
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if NavigationPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // Keep the website's own sign-in, permission and HTTP error screens visible.
        if response.isForMainFrame { mainStatus = (response.response as? HTTPURLResponse)?.statusCode }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { error = nil; mainStatus = nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onNavigationFinished?()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ failure: Error) {
        guard (failure as NSError).code != NSURLErrorCancelled else { return }
        error = "InFlite couldn’t connect. Check your connection and try again."

    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        error = "This page stopped responding. Reload it to pick up where you left off."
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if NavigationPolicy.isInternal(url) { webView.load(action.request) }
            else if NavigationPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
        }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = frame.request.url?.host ?? "InFlite"
        alert.informativeText = message; alert.addButton(withTitle: "OK")
        if let window = webView.window { alert.beginSheetModal(for: window) { _ in completionHandler() } }
        else { completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = frame.request.url?.host ?? "InFlite"
        alert.informativeText = message; alert.addButton(withTitle: "Continue"); alert.addButton(withTitle: "Cancel")
        if let window = webView.window { alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) } }
        else { completionHandler(false) }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard frame.request.url.map(NavigationPolicy.isInternal) == true, let window = webView.window else { completionHandler(nil); return }
        let panel = NSOpenPanel(); panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true; panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { track(download) }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { track(download) }
    private func track(_ download: WKDownload) { activeDownloads.append(download); download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let window = webView.window else { completionHandler(nil); return }
        let panel = NSSavePanel(); panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.url : nil) }
    }
    func downloadDidFinish(_ download: WKDownload) { activeDownloads.removeAll { $0 === download } }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        activeDownloads.removeAll { $0 === download }
        let alert = NSAlert(); alert.messageText = "Download didn’t finish"; alert.informativeText = "Try downloading the file again."
        if let window = webView.window { alert.beginSheetModal(for: window) }
    }
}

struct WebSurface: NSViewRepresentable {
    @ObservedObject var page: BrowserPage
    func makeNSView(context: Context) -> WKWebView { page.webView }
    func updateNSView(_ view: WKWebView, context: Context) { }
}

struct BrowserContent: View {
    @ObservedObject var page: BrowserPage
    let openInBrowser: () -> Void
    var body: some View {
        ZStack {
            WebSurface(page: page).id(page.id)
            if let error = page.error {
                ContentUnavailableView {
                    Label("Let’s try that again", systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: {
                    Button("Reload") { page.webView.reload() }.buttonStyle(.borderedProminent)
                    Button("Open in Browser", action: openInBrowser)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
        }
    }
}
