import AppKit
import SwiftUI
import WebKit
import InFliteCore

// Native SwiftUI owns Today, Apps and You. WebKit is limited to sign-in and unfinished app screens.
struct ContentView: View {
    @ObservedObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        HStack(spacing: 0) {
            sidebar.frame(width: 210)
            Divider()
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text(model.selection.title).font(.system(size: 13, weight: .semibold))
                    if !model.selection.isNative { Text("Website").font(.caption).foregroundStyle(.secondary); if let page = model.currentPage { BrowserNavigation(page: page) } }
                    Spacer()
                    if model.refreshing { ProgressView().controlSize(.small) }
                    Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                        .disabled(model.refreshing).help("Refresh Today · ⌘R")
                    if !model.selection.isNative {
                        Button(action: model.openInBrowser) { Image(systemName: "arrow.up.right.square") }.help("Open in browser")
                    }
                    SettingsLink { Image(systemName: "slider.horizontal.3") }.help("Mac settings")
                }.buttonStyle(.borderless).padding(.horizontal, 22).frame(height: 48).background(.bar)
                if model.sampleData {
                    Text("SAMPLE DATA · Layout preview only · Account changes disabled")
                        .font(.system(size: 11, weight: .semibold)).padding(9).frame(maxWidth: .infinity).background(.orange.opacity(0.15))
                }
                ZStack {
                    NativeSky()
                    Group {
                        switch model.selection {
                        case .today: NativeTodayView(model: model)
                        case .apps: NativeAppsView(model: model)
                        case .you: NativeYouView(model: model)
                        default:
                            if let page = model.currentPage { BrowserContent(page: page, openInBrowser: model.openInBrowser) }
                        }
                    }
                }
                if model.showFind, let page = model.currentPage { FindBar(page: page, isPresented: $model.showFind) }
            }
        }
        .tint(Color(red: 0.20, green: 0.40, blue: 0.85))
        .task { await model.refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model.refresh() } } }
        .sheet(isPresented: $model.showingSignIn, onDismiss: { Task { await model.refresh() } }) {
            VStack(spacing: 0) {
                HStack {
                    Text("Sign in to InFlite").font(.headline)
                    Spacer()
                    Button("Check sign-in") { Task { await model.refresh() } }
                    Button("Done") { model.showingSignIn = false }.keyboardShortcut(.cancelAction)
                }.padding(16)
                Divider()
                if let page = model.page { BrowserContent(page: page, openInBrowser: model.openInBrowser) }
            }.frame(width: 740, height: 650)
        }
    }
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) { SiteLogo(name: "LogoInFlite", size: 30); Text("InFlite").font(.system(size: 20, weight: .semibold)) }
                .padding(.top, 45).padding(.bottom, 20).padding(.horizontal, 18)
            ForEach([Destination.today, .chats, .apps, .you]) { destination in row(destination) }
            Text("YOUR APPS").font(.system(size: 10, weight: .semibold)).tracking(1.2).foregroundStyle(.secondary)
                .padding(.leading, 20).padding(.top, 18)
            ForEach([Destination.weather, .fitness, .markets] + (model.session?.apps?["mail"] == true ? [.mail] : [])) { destination in row(destination) }
            Spacer()
            Divider().padding(.horizontal, 18)
            Button { model.select(.you) } label: {
                HStack(spacing: 10) {
                    DestinationIcon(destination: .you, size: 30)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.signedIn ? model.userName : "Your account").font(.system(size: 12, weight: .medium)).lineLimit(1)
                        Text(model.signedIn ? "Account settings" : "Sign in to InFlite").font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                    Spacer()
                }.padding(15)
            }.buttonStyle(.plain)
            Text("BETA 3").font(.system(size: 9, weight: .medium)).tracking(1).foregroundStyle(.tertiary).padding(.horizontal, 18).padding(.bottom, 15)
        }.background(.ultraThinMaterial)
    }
    private func row(_ destination: Destination) -> some View {
        let selected = model.selection == destination
        return Button { model.select(destination) } label: {
            HStack(spacing: 11) {
                DestinationIcon(destination: destination, size: 24)
                Text(destination.title).font(.system(size: 13, weight: selected ? .semibold : .regular))
                Spacer()
            }.padding(.horizontal, 10).frame(height: 38)
                .background(selected ? Color.accentColor.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 10))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).padding(.horizontal, 10).accessibilityAddTraits(selected ? .isSelected : [])
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
