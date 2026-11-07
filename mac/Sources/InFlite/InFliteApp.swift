import SwiftUI
import InFliteCore

@main
@MainActor
struct InFliteApp: App {
    @StateObject private var model = AppModel()
    @AppStorage("appearance") private var appearance = "system"

    var body: some Scene {
        Window("InFlite", id: "main") {
            ContentView(model: model)
                .preferredColorScheme(appearance == "system" ? nil : appearance == "dark" ? .dark : .light)
                .frame(minWidth: 850, minHeight: 600)
        }
        .defaultSize(width: 1240, height: 820)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Go") {
                Button("Today") { model.select(.today) }.keyboardShortcut("1")
                Button("Chats") { model.select(.chats) }.keyboardShortcut("2")
                Button("Apps") { model.select(.apps) }.keyboardShortcut("3")
                Button("You") { model.select(.you) }.keyboardShortcut("4")
                Divider()
                ForEach(Destination.services.filter { $0 != .today }) { destination in
                    Button { model.select(destination) } label: {
                        Label { Text(destination.title) } icon: { DestinationIcon(destination: destination, size: 16) }
                    }
                }
                Divider()
                Button("Your Account") { model.select(.account) }.keyboardShortcut(",", modifiers: [.command, .shift])
            }
            CommandGroup(after: .toolbar) {
                Button("Reload Page") { model.currentPage?.webView.reload() }
                    .keyboardShortcut("r").disabled(model.currentPage == nil)
                Button("Open in Default Browser") { model.openInBrowser() }
                    .keyboardShortcut("b", modifiers: [.command, .shift]).disabled(model.currentPage == nil)
                Button("Find on Page…") { model.showFind.toggle() }
                    .keyboardShortcut("f").disabled(model.currentPage == nil)
            }
            CommandGroup(replacing: .help) {
                Link("InFlite for Mac Beta Guide", destination: URL(string: "https://github.com/georgefarrowgreen1/inflite/blob/codex/mac-beta/mac/README.md")!)
            }
        }
        Settings { SettingsView(model: model).frame(width: 440) }
    }
}
