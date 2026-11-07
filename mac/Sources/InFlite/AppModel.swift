import AppKit
import SwiftUI
import WebKit
import InFliteCore

@MainActor
final class AppModel: ObservableObject {
    @Published var selection: Destination = .workspace
    @Published var showSwitcher = false
    @Published var showFind = false
    @Published var showWelcome = !UserDefaults.standard.bool(forKey: "finishedWelcome")
    @Published var pages: [Destination: BrowserPage] = [:]
    let designPreview = ProcessInfo.processInfo.arguments.contains("--design-preview")

    var currentPage: BrowserPage? { pages[selection] }

    func select(_ destination: Destination) {
        selection = destination
        if !designPreview, let url = destination.url, pages[destination] == nil {
            pages[destination] = BrowserPage(url: url)
        }
        showSwitcher = false
    }

    func finishWelcome() {
        UserDefaults.standard.set(true, forKey: "finishedWelcome")
        showWelcome = false
    }

    func openInBrowser() {
        if let url = currentPage?.webView.url ?? selection.url,
           NavigationPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
    }

    func clearLocalSession() async {
        pages.values.forEach { $0.webView.stopLoading() }
        pages = [:]
        selection = .workspace
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }
}
