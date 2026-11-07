import SwiftUI
import InFliteCore

struct SettingsView: View {
    @ObservedObject var model: AppModel
    @AppStorage("appearance") private var appearance = "system"
    @State private var confirmClear = false
    var body: some View {
        Form {
            Section("Window appearance") {
                Picker("Default theme", selection: $appearance) {
                    Text("System").tag("system"); Text("Light").tag("light"); Text("Dark").tag("dark")
                }
            }
            Text("Today, Apps and You use native SwiftUI. Unfinished app sections use the existing website.").font(.caption).foregroundStyle(.secondary)
            Section("Your account") {
                Button("Open your InFlite account") { model.select(.account) }.buttonStyle(InFliteButtonStyle())
                Text("Your sign-in is shared between apps inside InFlite for Mac. Your browser has its own sign-in.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Clear sign-in and website data…", role: .destructive) { confirmClear = true }.buttonStyle(InFliteButtonStyle())
            }
            Section("Beta 4") {
                LabeledContent("Version", value: "0.1.0 (4)")
                Text("macOS 14 or later · Apple silicon and Intel").font(.caption).foregroundStyle(.secondary)
                Text("Background notifications and passkeys are not yet verified. Use your existing password to test sign-in. Browser sign-in does not sign this app in.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }.formStyle(.grouped)
            .alert("Clear this Mac’s InFlite data?", isPresented: $confirmClear) {
                Button("Cancel", role: .cancel) { }
                Button("Clear data", role: .destructive) { Task { await model.clearLocalSession() } }
            } message: { Text("This closes the app page and removes this app’s cookies, website cache and local drafts. Your account and server data stay intact.") }
    }
}
