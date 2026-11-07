import SwiftUI
import InFliteCore

struct NativeYouView: View {
    @ObservedObject var model: AppModel
    @State private var confirmSignOut = false
    @State private var signOutError: String?
    @State private var signingOut = false
    var body: some View {
        if !model.signedIn { NativeSignInView(model: model) }
        else {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 16) {
                        DestinationIcon(destination: .you, size: 56)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(model.userName).font(.system(size: 28, weight: .bold)).tracking(-0.7)
                            if let handle = model.session?.user?.handle { Text("@\(handle)").foregroundStyle(.secondary) }
                        }
                        Spacer()
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your account").font(.headline)
                        Text("Your profile, password, passkeys and signed-in devices are managed through InFlite’s existing account page.")
                            .font(.callout).foregroundStyle(.secondary)
                        Button("Security and profile on web") { model.select(.account) }.buttonStyle(InFliteButtonStyle()).disabled(model.sampleData)
                    }.padding(22).nativeGlass()
                    if let morning = model.day?.morning { MorningEditor(model: model, initial: morning) }
                    else { Text("Refresh Today to load your morning settings.").font(.callout).foregroundStyle(.secondary) }
                    if let hours = model.quietSettings { QuietEditor(model: model, initial: hours).id("quiet") }
                    else {
                        HStack {
                            Text(model.settingsMessage ?? "Loading Quiet Hours…").font(.callout).foregroundStyle(.secondary)
                            Spacer()
                            Button("Retry") { Task { await model.loadQuietSettings() } }.buttonStyle(InFliteButtonStyle())
                        }.padding(22).nativeGlass()
                    }
                    if let prefs = model.session?.prefs { CardsEditor(model: model, initial: prefs).id("cards") }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("On this Mac").font(.headline)
                        Text("Background notifications aren’t implemented in this beta. Morning and Quiet Hours changes apply to your account and its registered devices.")
                            .font(.callout).foregroundStyle(.secondary)
                        SettingsLink { Text("Appearance and local data") }.buttonStyle(InFliteButtonStyle())
                        Button("Sign out…", role: .destructive) { confirmSignOut = true }.buttonStyle(InFliteButtonStyle()).disabled(signingOut || model.sampleData)
                        if let signOutError { Text(signOutError).font(.caption).foregroundStyle(.red) }
                    }.padding(22).nativeGlass()
                }.padding(30).frame(maxWidth: 850).frame(maxWidth: .infinity)
            }.task {
                await model.loadQuietSettings()
                let args = ProcessInfo.processInfo.arguments
                if let i = args.firstIndex(of: "--capture-section"), i + 1 < args.count, ["quiet", "cards"].contains(args[i + 1]) {
                    try? await Task.sleep(nanoseconds: 400_000_000)
                    proxy.scrollTo(args[i + 1], anchor: .top)
                }
            }
                .alert("Sign out of InFlite?", isPresented: $confirmSignOut) {
                    Button("Cancel", role: .cancel) { }
                    Button("Sign out", role: .destructive) {
                        signingOut = true
                        Task {
                            do { try await model.signOut() } catch { signOutError = error.localizedDescription }
                            signingOut = false
                        }
                    }
                } message: { Text("This ends the shared InFlite sign-in and clears this app’s website data, including unsynced local drafts.") }
            }
        }
    }
}

struct MorningEditor: View {
    @ObservedObject var model: AppModel
    let initial: MorningSettings
    @State private var on: Bool
    @State private var minutes: Int
    @State private var saving = false
    @State private var result: String?
    init(model: AppModel, initial: MorningSettings) {
        self.model = model; self.initial = initial
        _on = State(initialValue: initial.on)
        _minutes = State(initialValue: initial.at)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Morning briefing").font(.headline)
            Toggle("Send my morning briefing", isOn: $on).toggleStyle(.switch).disabled(saving)
            HStack {
                TimeMenu(title: "Time", selection: $minutes, values: Array(stride(from: 0, through: 1435, by: 5)))
                    .disabled(saving)
                Text(initial.tz ?? "Account time zone").font(.caption).foregroundStyle(.secondary)
                Spacer()
            }
            Text("Delivered to your existing registered devices. This doesn’t enable notifications on this Mac.")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button(saving ? "Saving…" : "Save morning settings") {
                    saving = true; result = nil
                    Task {
                        do { try await model.saveMorning(on: on, at: minutes); result = "Saved" }
                        catch { result = error.localizedDescription }
                        saving = false
                    }
                }.buttonStyle(InFliteButtonStyle(.primary)).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass()
    }
}

struct QuietEditor: View {
    @ObservedObject var model: AppModel
    let initial: QuietHours
    @State private var on: Bool
    @State private var from: Int
    @State private var to: Int
    @State private var saving = false
    @State private var result: String?
    init(model: AppModel, initial: QuietHours) {
        self.model = model; self.initial = initial
        _on = State(initialValue: initial.on)
        _from = State(initialValue: initial.from)
        _to = State(initialValue: initial.to)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Quiet Hours").font(.headline)
            Toggle("Keep notifications quiet overnight", isOn: $on).toggleStyle(.switch).disabled(saving)
            HStack {
                hourPicker("From", value: $from)
                hourPicker("Until", value: $to)
                Spacer()
            }
            Text(initial.tz ?? "Account time zone").font(.caption).foregroundStyle(.secondary)
            HStack {
                Button(saving ? "Saving…" : "Save Quiet Hours") {
                    saving = true; result = nil
                    Task {
                        do {
                            try await model.saveQuiet(QuietHours(on: on, from: from, to: to, tz: initial.tz))
                            result = "Saved"
                        } catch { result = error.localizedDescription }
                        saving = false
                    }
                }.buttonStyle(InFliteButtonStyle(.primary)).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass()
    }
    private func hourPicker(_ label: String, value: Binding<Int>) -> some View {
        TimeMenu(title: label, selection: value, values: Array(0..<24), minutesPerValue: 60).disabled(saving)
    }
}

struct CardsEditor: View {
    @ObservedObject var model: AppModel
    let initial: CardPreferences
    @State private var hidden: Set<String>
    @State private var saving = false
    @State private var result: String?
    init(model: AppModel, initial: CardPreferences) {
        self.model = model; self.initial = initial
        _hidden = State(initialValue: Set(initial.hidden))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("On Today").font(.headline)
            ForEach(CardKind.allCases) { kind in
                Toggle(isOn: Binding(get: { !hidden.contains(kind.rawValue) }, set: { visible in
                    if visible { hidden.remove(kind.rawValue) } else { hidden.insert(kind.rawValue) }
                })) { Label { Text(kind.destination.title) } icon: { DestinationIcon(destination: kind.destination, size: 22) } }
                    .toggleStyle(.switch).disabled(saving)
            }
            HStack {
                Button(saving ? "Saving…" : "Save card visibility") {
                    saving = true; result = nil
                    Task {
                        do { try await model.saveCards(hidden: hidden.sorted()); result = "Saved" }
                        catch { result = error.localizedDescription }
                        saving = false
                    }
                }.buttonStyle(InFliteButtonStyle(.primary)).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass()
    }
}
