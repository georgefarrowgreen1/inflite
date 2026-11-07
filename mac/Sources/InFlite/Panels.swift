import SwiftUI
import InFliteCore

struct WelcomeView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 20) {
            BrandMark(size: 80).padding(.top, 10)
            Text("InFlite. At home on Mac.").font(.system(size: 27, weight: .medium, design: .rounded)).tracking(-0.8)
            Text("A familiar place, with a little more space.").foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 18) {
                Label("Your existing InFlite account and services", systemImage: "person.crop.circle")
                Label("A sidebar and shortcuts that feel like Mac", systemImage: "sidebar.left")
                Label("Links to other sites open in your browser", systemImage: "arrow.up.right.square")
            }.font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading).padding(23)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
            Text("Beta 1 · Mail is owner-only. Chats remain on iPhone and iPad.\nPasskeys and background notifications aren’t verified in this beta.")
                .font(.system(size: 11)).foregroundStyle(.secondary).multilineTextAlignment(.center).lineSpacing(4)
            Button("Make yourself at home") { model.finishWelcome() }.buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.defaultAction)
        }.padding(34).frame(width: 460)
    }
}

struct SwitcherView: View {
    @ObservedObject var model: AppModel
    @State private var query = ""
    @FocusState private var focused: Bool
    private var results: [Destination] {
        Destination.allCases.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Where would you like to go?", text: $query).textFieldStyle(.plain)
                    .font(.system(size: 17)).focused($focused).onSubmit { if let destination = results.first { model.select(destination) } }
                Button("Esc") { model.showSwitcher = false }.keyboardShortcut(.escape, modifiers: []).buttonStyle(.borderless)
            }.padding(23)
            Divider()
            if results.isEmpty {
                Text("No apps match “\(query)”.").foregroundStyle(.secondary).padding(32)
            } else {
                VStack(spacing: 3) {
                    ForEach(results) { destination in
                        Button { model.select(destination) } label: {
                            HStack(spacing: 13) {
                                Image(systemName: destination.symbol).foregroundStyle(destination.tint).frame(width: 24)
                                Text(destination.title)
                                Spacer()
                                Text(destination.subtitle).font(.caption).foregroundStyle(.secondary)
                            }.padding(12).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }.padding(10)
            }
        }.frame(width: 550).onAppear { focused = true }
    }
}

struct SettingsView: View {
    @ObservedObject var model: AppModel
    @AppStorage("appearance") private var appearance = "system"
    @State private var confirmClear = false
    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Theme", selection: $appearance) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }
            }
            Section("Your account") {
                Button("Open your InFlite account") { model.select(.account) }
                Text("Your sign-in is shared between apps inside InFlite for Mac. Your browser has its own sign-in.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Clear sign-in and website data…", role: .destructive) { confirmClear = true }
            }
            Section("Beta 1") {
                LabeledContent("Version", value: "0.1.0 (1)")
                Text("macOS 14 or later · Apple silicon and Intel").font(.caption).foregroundStyle(.secondary)
                Text("Background notifications and passkeys are not yet verified. Use your existing password to test sign-in. Browser sign-in does not sign this app in.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }.formStyle(.grouped)
            .alert("Clear this Mac’s InFlite data?", isPresented: $confirmClear) {
                Button("Cancel", role: .cancel) { }
                Button("Clear data", role: .destructive) { Task { await model.clearLocalSession() } }
            } message: { Text("This closes open app pages and removes this app’s cookies, website cache and local drafts. Your account and server data stay intact.") }
    }
}
