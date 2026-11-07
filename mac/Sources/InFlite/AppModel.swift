import AppKit
import SwiftUI
import WebKit
import InFliteCore

@MainActor
final class AppModel: ObservableObject {
    @Published var showFind = false
    @Published var page: BrowserPage?
    var currentPage: BrowserPage? { page }

    init() { page = BrowserPage(url: Destination.today.url!) }

    func select(_ destination: Destination) {
        guard let url = destination.url else { return }
        guard let page else { self.page = BrowserPage(url: url); return }
        page.webView.load(URLRequest(url: url))
    }

    func openInBrowser() {
        if let url = page?.webView.url, NavigationPolicy.canOpenExternally(url) {
            NSWorkspace.shared.open(url)
        }
    }

    func clearLocalSession() async {
        page?.webView.stopLoading()
        page = nil
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
        page = BrowserPage(url: Destination.today.url!)
    }
}
