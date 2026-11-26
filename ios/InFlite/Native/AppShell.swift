import SwiftUI

@MainActor
struct NativeRootView: View {
    private enum Phase {
        case opening, signedOut, ready(BackendUser), unavailable
    }

    @State private var phase: Phase = .opening
    @State private var initialToday: BackendToday?
    @State private var destination: InFliteRoute = .today
    @State private var pendingRoute: InFliteRoute?
    @State private var signIn = false
    @State private var signingOut = false
    @State private var signOutFailed = false
    @State private var reload = 0
    @AppStorage("inflite.native.appearance") private var appearance = "system"

    private var preview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-test-native")
        #else
        false
        #endif
    }

    var body: some View {
        ZStack {
            NativeWallpaper(animate: !preview)
            switch phase {
            case .opening:
                ProgressView("Opening InFlite")
                    .accessibilityIdentifier("opening-inflite")
            case .signedOut:
                welcome
            case .unavailable:
                ContentUnavailableView {
                    Label("InFlite couldn’t connect", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("Check your connection and try again.")
                } actions: {
                    Button("Try again") { reload += 1 }
                        .buttonStyle(.borderedProminent)
                    Link("InFlite Status", destination: InFliteRoute.status.url)
                }
            case .ready(let user):
                NativeWorkspace(user: user, initialToday: initialToday, preview: preview,
                                destination: $destination, appearance: $appearance) {
                    Task { await signOut() }
                } onSessionExpired: {
                    initialToday = nil
                    reload += 1
                }
                .id(user.id)
                .disabled(signingOut)
                .overlay {
                    if signingOut { ProgressView("Signing out").padding(20).background(.regularMaterial, in: .rect(cornerRadius: 22)) }
                }
            }
        }
        .tint(NativeStyle.accent)
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .task(id: reload) { await restoreSession() }
        .alert("Couldn’t sign out", isPresented: $signOutFailed) {
            Button("Try again") { Task { await signOut() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Check your connection and try again.")
        }
        .sheet(isPresented: $signIn) {
            BackendSignInView { session in
                signIn = false
                accept(session)
            }
        }
        .onOpenURL { url in
            guard let route = InFliteRoute(link: url) else { return }
            if case .ready = phase {
                destination = route
            } else {
                pendingRoute = route
            }
        }
    }

    private var welcome: some View {
        ScrollView {
            VStack(spacing: 26) {
                Spacer(minLength: 64)
                Image("InFliteMark")
                    .resizable().scaledToFit()
                    .frame(width: 92, height: 92)
                    .clipShape(.rect(cornerRadius: 24))
                    .accessibilityHidden(true)
                Text("InFlite")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Button {
                    signIn = true
                } label: {
                    Text("Sign in")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("native-sign-in")
                Link("About InFlite", destination: InFliteRoute.origin.appendingPathComponent("about/"))
                    .font(.subheadline.weight(.medium))
            }
            .frame(maxWidth: 420)
            .padding(24)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private func restoreSession() async {
        phase = .opening
        #if DEBUG
        if preview {
            let user = BackendUser(id: "preview", name: "Alex Morgan", first: "Alex", handle: nil, appearance: nil, photoAt: nil)
            phase = .ready(user)
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-signed-out") {
            phase = .signedOut
            return
        }
        #endif
        do {
            let response = try await BackendClient.shared.bootstrap()
            guard !Task.isCancelled else { return }
            initialToday = response.cards
            accept(response.view)
        } catch {
            guard !Task.isCancelled else { return }
            phase = .unavailable
        }
    }

    private func accept(_ session: BackendSession) {
        guard session.signedIn, let user = session.user else {
            initialToday = nil
            phase = .signedOut
            return
        }
        destination = pendingRoute ?? .today
        pendingRoute = nil
        phase = .ready(user)
    }

    private func resetSession() {
        initialToday = nil
        pendingRoute = nil
        destination = .today
        phase = .signedOut
    }

    private func signOut() async {
        guard !signingOut else { return }
        signingOut = true
        defer { signingOut = false }
        do {
            try await BackendClient.shared.signOut()
            resetSession()
        } catch {
            signOutFailed = true
        }
    }
}

private struct NativeWorkspace: View {
    let user: BackendUser
    let initialToday: BackendToday?
    let preview: Bool
    @Binding var destination: InFliteRoute
    @Binding var appearance: String
    let signOut: () -> Void
    let onSessionExpired: () -> Void
    @State private var appsOpen = false
    @State private var quickCapture = false
    @State private var appQuery = ""
    @State private var visited: Set<InFliteRoute> = [.today]

    private let pins: [InFliteRoute] = [.today, .weather, .markets, .fitness, .mail]
    private let apps: [InFliteRoute] = [.calendar, .notes, .people, .files, .fitness, .weather, .markets, .chats, .mail, .status, .account]
    private var visibleApps: [InFliteRoute] {
        let query = appQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return query.isEmpty ? apps : apps.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        ZStack {
            ForEach(InFliteRoute.allCases.filter { visited.contains($0) || $0 == destination }, id: \.rawValue) { route in
                NavigationStack {
                    screen(route)
                }
                .opacity(destination == route ? 1 : 0)
                .allowsHitTesting(destination == route)
                .accessibilityHidden(destination != route)
                .zIndex(destination == route ? 1 : 0)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .onChange(of: destination, initial: true) { _, route in visited.insert(route) }
        .sheet(isPresented: $appsOpen, onDismiss: { appQuery = "" }) { appLibrary }
        .confirmationDialog("Quick Capture", isPresented: $quickCapture, titleVisibility: .visible) {
            Button("Notes") { destination = .notes }
            Button("Calendar") { destination = .calendar }
        }
    }

    private var dock: some View {
        HStack(spacing: 3) {
            ForEach(pins, id: \.rawValue) { route in
                Button { destination = route } label: {
                    dockLabel(route.title, selected: destination == route) {
                        NativeAppIcon(route: route, size: 29)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("dock-\(route.rawValue)")
                .accessibilityAddTraits(destination == route ? .isSelected : [])
            }
            Divider().frame(height: 31)
            Button { appsOpen = true } label: {
                dockLabel("Apps", selected: false) {
                    Image(systemName: "square.grid.2x2").font(.system(size: 23, weight: .medium))
                        .frame(width: 29, height: 29)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("dock-apps")
        }
        .padding(5)
        .background(.regularMaterial, in: .rect(cornerRadius: 25))
        .overlay { RoundedRectangle(cornerRadius: 25).strokeBorder(.primary.opacity(0.13), lineWidth: 1).allowsHitTesting(false) }
        .frame(maxWidth: 540)
        .padding(.horizontal, 16)
        .padding(.bottom, 5)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("native-dock")
    }

    private func dockLabel<Icon: View>(_ title: String, selected: Bool, @ViewBuilder icon: () -> Icon) -> some View {
        VStack(spacing: 4) {
            icon().accessibilityHidden(true)
            Text(title)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .foregroundStyle(.primary)
        .frame(maxWidth: .infinity, minHeight: 55)
        .background(selected ? Color.primary.opacity(0.1) : .clear, in: .rect(cornerRadius: 19))
        .contentShape(.rect)
    }

    private var appLibrary: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 12)], spacing: 21) {
                    ForEach(visibleApps, id: \.rawValue) { app in
                        Button {
                            destination = app
                            appsOpen = false
                        } label: {
                            VStack(spacing: 8) {
                                NativeAppIcon(route: app, size: 49)
                                Text(app.title).font(.subheadline).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity)
                            .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("app-\(app.rawValue)")
                    }
                }
                .padding(22)
                if visibleApps.isEmpty {
                    ContentUnavailableView.search(text: appQuery)
                }
            }
            .searchable(text: $appQuery, prompt: "Search apps")
            .navigationTitle("Your apps")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { appsOpen = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private func screen(_ route: InFliteRoute) -> some View {
        switch route {
        case .today:
            NativeTodayView(user: user, initialToday: initialToday, preview: preview) {
                destination = $0
            } capture: {
                quickCapture = true
            } onSessionExpired: {
                onSessionExpired()
            }
            .toolbar(.hidden, for: .navigationBar)
        case .weather:
            NativeWeatherView(owner: user.id)
        case .markets:
            ActivityMarketsView(owner: user.id)
        case .fitness:
            ActivityFitnessView(owner: user.id)
        case .mail:
            NativeMailView(owner: user.id, active: destination == .mail)
        case .calendar:
            NativeCalendarView(owner: user.id)
        case .notes:
            NativeNotesView(owner: user.id)
        case .files:
            NativeFilesView(owner: user.id)
        case .people:
            NativePeopleView(owner: user.id)
        case .status:
            ActivityStatusView()
        case .account:
            settings
        default:
            ContentUnavailableView {
                Label(route.title, systemImage: route.symbol)
            } actions: {
                Link("Open \(route.title) in Safari", destination: route.url)
                    .buttonStyle(.borderedProminent)
            }
            .navigationTitle(route.title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var settings: some View {
        List {
            Section("Account") {
                Text(user.name).font(.headline)
                Link("Manage account", destination: InFliteRoute.account.url)
                Button("Sign out", role: .destructive, action: signOut)
            }
            Section("Appearance") {
                Picker("Theme", selection: $appearance) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
            }
            Section("InFlite") {
                Link("Privacy", destination: InFliteRoute.origin.appendingPathComponent("privacy/"))
                Link("Support", destination: InFliteRoute.origin.appendingPathComponent("contact/"))
                LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("Settings")
    }
}
