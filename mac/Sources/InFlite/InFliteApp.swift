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
            CommandMenu("Workspace") {
                Button("Go to Workspace") { model.select(.workspace) }.keyboardShortcut("0")
                ForEach(Array(Destination.services.enumerated()), id: \.element.id) { index, destination in
                    Button(destination.title) { model.select(destination) }
                        .keyboardShortcut(KeyEquivalent(Character(String(index + 1))))
                }
                Divider()
                Button("Switch App…") { model.showSwitcher.toggle() }.keyboardShortcut("k")
                Button("Your Account") { model.select(.account) }.keyboardShortcut(",", modifiers: [.command, .shift])
            }
            CommandGroup(after: .toolbar) {
                Button("Reload Page") { model.currentPage?.webView.reload() }
                    .keyboardShortcut("r").disabled(model.currentPage == nil)
                Button("Open in Default Browser") { model.openInBrowser() }
                    .keyboardShortcut("b", modifiers: [.command, .shift]).disabled(model.selection.url == nil)
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
