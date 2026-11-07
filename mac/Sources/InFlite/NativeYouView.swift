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
                        Button("Security and profile on web") { model.select(.account) }.buttonStyle(.bordered)
                    }.padding(22).nativeGlass()
                    if let morning = model.day?.morning { MorningEditor(model: model, initial: morning) }
                    else { Text("Refresh Today to load your morning settings.").font(.callout).foregroundStyle(.secondary) }
                    if let hours = model.quietSettings { QuietEditor(model: model, initial: hours) }
                    else {
                        HStack {
                            Text(model.settingsMessage ?? "Loading Quiet Hours…").font(.callout).foregroundStyle(.secondary)
                            Spacer()
                            Button("Retry") { Task { await model.loadQuietSettings() } }
                        }.padding(22).nativeGlass()
                    }
                    if let prefs = model.session?.prefs { CardsEditor(model: model, initial: prefs) }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("On this Mac").font(.headline)
                        Text("Background notifications aren’t implemented in this beta. Morning and Quiet Hours changes apply to your account and its registered devices.")
                            .font(.callout).foregroundStyle(.secondary)
                        SettingsLink { Text("Appearance and local data") }.buttonStyle(.bordered)
                        Button("Sign out…", role: .destructive) { confirmSignOut = true }.disabled(signingOut || model.sampleData)
                        if let signOutError { Text(signOutError).font(.caption).foregroundStyle(.red) }
                    }.padding(22).nativeGlass()
                }.padding(30).frame(maxWidth: 850).frame(maxWidth: .infinity)
            }.task { await model.loadQuietSettings() }
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

struct MorningEditor: View {
    @ObservedObject var model: AppModel
    let initial: MorningSettings
    @State private var on = false
    @State private var minutes = 420
    @State private var saving = false
    @State private var result: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Morning briefing").font(.headline)
            Toggle("Send my morning briefing", isOn: $on)
            HStack {
                Picker("Time", selection: $minutes) {
                    ForEach(Array(stride(from: 0, through: 1435, by: 5)), id: \.self) { value in
                        Text(String(format: "%02d:%02d", value / 60, value % 60)).tag(value)
                    }
                }.frame(maxWidth: 220)
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
                }.buttonStyle(.bordered).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass().onAppear { on = initial.on; minutes = initial.at }
    }
}

struct QuietEditor: View {
    @ObservedObject var model: AppModel
    let initial: QuietHours
    @State private var on = false
    @State private var from = 22
    @State private var to = 7
    @State private var saving = false
    @State private var result: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Quiet Hours").font(.headline)
            Toggle("Keep notifications quiet overnight", isOn: $on)
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
                }.buttonStyle(.bordered).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass().onAppear { on = initial.on; from = initial.from; to = initial.to }
    }
    private func hourPicker(_ label: String, value: Binding<Int>) -> some View {
        Picker(label, selection: value) { ForEach(0..<24) { hour in Text(String(format: "%02d:00", hour)).tag(hour) } }.frame(maxWidth: 170)
    }
}

struct CardsEditor: View {
    @ObservedObject var model: AppModel
    let initial: CardPreferences
    @State private var hidden = Set<String>()
    @State private var saving = false
    @State private var result: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("On Today").font(.headline)
            ForEach(CardKind.allCases) { kind in
                Toggle(isOn: Binding(get: { !hidden.contains(kind.rawValue) }, set: { visible in
                    if visible { hidden.remove(kind.rawValue) } else { hidden.insert(kind.rawValue) }
                })) { Label { Text(kind.destination.title) } icon: { DestinationIcon(destination: kind.destination, size: 22) } }
            }
            HStack {
                Button(saving ? "Saving…" : "Save card visibility") {
                    saving = true; result = nil
                    Task {
                        do { try await model.saveCards(hidden: hidden.sorted()); result = "Saved" }
                        catch { result = error.localizedDescription }
                        saving = false
                    }
                }.buttonStyle(.bordered).disabled(saving || model.sampleData)
                if let result { Text(result).font(.caption).foregroundStyle(.secondary) }
            }
        }.padding(22).nativeGlass().onAppear { hidden = Set(initial.hidden) }
    }
}
