import AppKit
import SwiftUI
import WebKit
import InFliteCore

// The live website owns the app interface: navigation, type, glass, logos, themes and sheets.
// Mac chrome provides only window-level actions and never substitutes a second dashboard.
struct ContentView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if let page = model.currentPage { BrowserNavigation(page: page) }
                Spacer()
                SiteLogo(name: "LogoInFlite", size: 20)
                Text("InFlite").font(.system(size: 12, weight: .semibold))
                Spacer()
                Button(action: model.openInBrowser) { Image(systemName: "arrow.up.right.square") }
                    .buttonStyle(.borderless).help("Open in your default browser · ⇧⌘B")
                SettingsLink { Image(systemName: "slider.horizontal.3") }.buttonStyle(.borderless).help("Mac settings")
            }
            .padding(.leading, 83).padding(.trailing, 16).frame(height: 40)
            .background(.bar)
            Divider()
            if let page = model.currentPage {
                BrowserContent(page: page, openInBrowser: model.openInBrowser)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if model.showFind { FindBar(page: page, isPresented: $model.showFind) }
            } else {
                ProgressView("Clearing website data…").frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

struct BrowserNavigation: View {
    @ObservedObject var page: BrowserPage
    var body: some View {
        HStack(spacing: 14) {
            Button { page.webView.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!page.canGoBack).help("Back")
            Button { page.webView.goForward() } label: { Image(systemName: "chevron.right") }.disabled(!page.canGoForward).help("Forward")
            Button { if page.isLoading { page.webView.stopLoading() } else { page.webView.reload() } } label: {
                Image(systemName: page.isLoading ? "xmark" : "arrow.clockwise")
            }.help(page.isLoading ? "Stop loading" : "Reload · ⌘R")
            Divider().frame(height: 16)
        }.buttonStyle(.borderless)
    }
}

struct FindBar: View {
    @ObservedObject var page: BrowserPage
    @Binding var isPresented: Bool
    @State private var query = ""
    @State private var message = ""
    @FocusState private var focused: Bool
    private func find(backwards: Bool = false) {
        guard !query.isEmpty else { return }
        let configuration = WKFindConfiguration(); configuration.backwards = backwards; configuration.wraps = true
        page.webView.find(query, configuration: configuration) { result in message = result.matchFound ? "" : "No match" }
    }
    var body: some View {
        HStack {
            TextField("Find on page", text: $query).textFieldStyle(.roundedBorder).frame(maxWidth: 280)
                .focused($focused).onSubmit { find() }
            Text(message).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Button("Previous") { find(backwards: true) }.disabled(query.isEmpty)
            Button("Next") { find() }.disabled(query.isEmpty)
            Button("Done") { isPresented = false }.keyboardShortcut(.escape, modifiers: [])
        }.padding(12).background(.bar).onAppear { focused = true }
    }
}
