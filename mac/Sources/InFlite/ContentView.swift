import AppKit
import SwiftUI
import WebKit
import InFliteCore

extension Destination {
    var tint: Color {
        switch self {
        case .workspace, .account: return Color(red: 0.42, green: 0.39, blue: 0.81)
        case .today: return Color(red: 0.85, green: 0.55, blue: 0.13)
        case .mail: return Color(red: 0.35, green: 0.48, blue: 0.85)
        case .weather: return Color(red: 0.22, green: 0.58, blue: 0.79)
        case .fitness: return Color(red: 0.20, green: 0.59, blue: 0.49)
        case .markets: return Color(red: 0.62, green: 0.41, blue: 0.79)
        case .chats: return Color(red: 0.33, green: 0.55, blue: 0.85)
        }
    }
}

struct ContentView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(spacing: 0) {
            sidebar.frame(width: 222)
            Divider()
            VStack(spacing: 0) {
                topbar
                Divider().opacity(0.6)
                Group {
                    if model.selection == .workspace {
                        WorkspaceView(model: model)
                    } else if model.selection == .chats {
                        ChatAvailabilityView()
                    } else if model.designPreview {
                        ContentUnavailableView(model.selection.title, systemImage: model.selection.symbol,
                            description: Text("Open the beta normally to use the live service."))
                    } else if let page = model.currentPage {
                        BrowserContent(page: page, openInBrowser: model.openInBrowser)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if model.showFind, let page = model.currentPage { FindBar(page: page, isPresented: $model.showFind) }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .tint(Color(red: 0.43, green: 0.40, blue: 0.82))
        .sheet(isPresented: $model.showSwitcher) { SwitcherView(model: model) }
        .sheet(isPresented: Binding(get: { model.showWelcome && !model.designPreview }, set: { if !$0 { model.finishWelcome() } })) {
            WelcomeView(model: model)
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                BrandMark(size: 32)
                Text("InFlite").font(.system(size: 20, weight: .semibold, design: .rounded))
                Spacer()
            }
            .padding(.top, 48).padding(.bottom, 28).padding(.horizontal, 21)

            Button { model.showSwitcher = true } label: {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text("Switch app").font(.system(size: 12))
                    Spacer()
                    Text("⌘K").font(.system(size: 10, design: .monospaced)).foregroundStyle(.tertiary)
                }.foregroundStyle(.secondary).padding(10)
                    .background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).padding(.horizontal, 14).padding(.bottom, 23)

            navigationRow(.workspace, shortcut: "0")
            Text("YOUR APPS").font(.system(size: 10, weight: .semibold)).tracking(1.3)
                .foregroundStyle(.tertiary).padding(.leading, 25).padding(.top, 26).padding(.bottom, 10)
            ForEach(Array(Destination.services.enumerated()), id: \.element.id) { index, destination in
                navigationRow(destination, shortcut: String(index + 1))
            }
            navigationRow(.chats, shortcut: nil)
            Spacer(minLength: 28)
            HStack(spacing: 7) {
                Image(systemName: "sparkle").foregroundStyle(.tint)
                Text("Made room for Mac.").font(.system(size: 11)).foregroundStyle(.secondary)
            }.padding(.horizontal, 25).padding(.bottom, 20)
            Divider().padding(.horizontal, 20)
            navigationRow(.account, shortcut: nil).padding(.top, 12)
            HStack {
                Text("MAC BETA").tracking(1.3)
                Spacer()
                Text("0.1.0")
            }.font(.system(size: 9, weight: .medium)).foregroundStyle(.tertiary)
                .padding(.horizontal, 25).padding(.top, 14).padding(.bottom, 21)
        }
        .background(.ultraThinMaterial)
    }

    private func navigationRow(_ destination: Destination, shortcut: String?) -> some View {
        let selected = model.selection == destination
        return Button { model.select(destination) } label: {
            HStack(spacing: 11) {
                Image(systemName: destination.symbol).font(.system(size: 14, weight: .medium))
                    .foregroundStyle(selected ? .white : destination.tint).frame(width: 20)
                Text(destination.title).font(.system(size: 13, weight: selected ? .semibold : .regular))
                Spacer()
                if let shortcut {
                    Text("⌘\(shortcut)").font(.system(size: 10, design: .monospaced)).opacity(selected ? 0.6 : 0.25)
                } else if destination == .chats {
                    Image(systemName: "iphone").font(.system(size: 10)).opacity(0.4)
                }
            }
            .foregroundStyle(selected ? Color.white : Color.primary)
            .padding(.horizontal, 12).frame(height: 39)
            .background(selected ? Color(red: 0.45, green: 0.42, blue: 0.81) : .clear, in: RoundedRectangle(cornerRadius: 9))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).padding(.horizontal, 13).padding(.vertical, 2)
        .accessibilityLabel(destination.title).accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var topbar: some View {
        HStack(spacing: 13) {
            if let page = model.currentPage { BrowserNavigation(page: page) }
            Text(model.selection.title).font(.system(size: 13, weight: .semibold))
            if model.selection != .workspace, model.selection != .chats {
                Image(systemName: "lock.fill").font(.system(size: 9)).foregroundStyle(.tertiary)
                Text(model.currentPage?.location.isEmpty == false ? model.currentPage!.location : model.selection.url?.host ?? "")
                    .font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if model.designPreview {
                Text("DESIGN PREVIEW").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(.secondary)
            }
            if model.selection.url != nil {
                Button(action: model.openInBrowser) { Image(systemName: "arrow.up.right.square") }
                    .buttonStyle(.borderless).help("Open in your default browser · ⇧⌘B")
            }
            SettingsLink { Image(systemName: "slider.horizontal.3") }.buttonStyle(.borderless).help("Settings")
        }
        .padding(.horizontal, 24).frame(height: 58)
    }
}

struct BrowserNavigation: View {
    @ObservedObject var page: BrowserPage
    var body: some View {
        HStack(spacing: 14) {
            Button { page.webView.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!page.canGoBack).help("Back")
            Button { page.webView.goForward() } label: { Image(systemName: "chevron.right") }.disabled(!page.canGoForward).help("Forward")
            Button { page.isLoading ? page.webView.stopLoading() : page.webView.reload() } label: {
                Image(systemName: page.isLoading ? "xmark" : "arrow.clockwise")
            }.help(page.isLoading ? "Stop loading" : "Reload · ⌘R")
            Divider().frame(height: 16)
        }.buttonStyle(.borderless)
    }
}

struct BrandMark: View {
    let size: CGFloat
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.25)
                .fill(LinearGradient(colors: [Color(red: 0.24, green: 0.29, blue: 0.50), Color(red: 0.10, green: 0.13, blue: 0.27)], startPoint: .topLeading, endPoint: .bottomTrailing))
            ForEach(0..<4) { index in
                Capsule().fill([Color.blue, Color.orange, Color.teal, Color.purple][index].gradient)
                    .frame(width: size * 0.18, height: size * 0.36)
                    .offset(y: -size * 0.20).rotationEffect(.degrees(Double(index) * 90 + 45))
            }
            Circle().fill(Color(red: 1, green: 0.78, blue: 0.25).gradient).frame(width: size * 0.23, height: size * 0.23)
        }.frame(width: size, height: size).accessibilityHidden(true)
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
