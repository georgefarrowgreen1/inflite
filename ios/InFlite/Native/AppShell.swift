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
    @State private var publicDestination: InFliteRoute?
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
                    Button("InFlite Status") { open(.status) }
                }
            case .ready(let user):
                NativeWorkspace(user: user, initialToday: initialToday, preview: preview,
                                destination: $destination, appearance: $appearance, onProfileChange: updateProfile) {
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
        .sheet(item: $publicDestination) { route in
            if let page = route.publicPage {
                NativePublicSheet(page: page)
            } else {
                PublicStatusSheet()
            }
        }
        .onOpenURL { url in
            guard let route = InFliteRoute(link: url) else { return }
            open(route)
        }
        .environment(\.openURL, OpenURLAction { url in
            guard let route = InFliteRoute(link: url) else { return .systemAction }
            open(route)
            return .handled
        })
    }

    private func open(_ route: InFliteRoute) {
        if case .ready = phase {
            destination = route
        } else if route.publicPage != nil || route == .status {
            publicDestination = route
        } else {
            pendingRoute = route
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
                Button("About InFlite") { open(.about) }
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
        if ProcessInfo.processInfo.arguments.contains("--ui-test-recovery") {
            phase = reload == 0 ? .unavailable : .signedOut
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

    private func updateProfile(_ profile: NativeAccountProfile) {
        guard case .ready(let user) = phase, profile.id == user.id, let name = profile.name else { return }
        phase = .ready(BackendUser(
            id: user.id, name: name, first: name.split(separator: " ").first.map(String.init),
            handle: profile.handle, appearance: user.appearance, photoAt: profile.photoAt
        ))
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

private struct PublicStatusSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ActivityStatusView()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                }
        }
    }
}

private extension InFliteRoute {
    var publicPage: NativePublicPage? {
        switch self {
        case .about: .about
        case .privacy: .privacy
        case .support: .contact
        case .storage: .storage
        case .terms: .terms
        default: nil
        }
    }
}

private struct NativeWorkspace: View {
    let user: BackendUser
    let initialToday: BackendToday?
    let preview: Bool
    @Binding var destination: InFliteRoute
    @Binding var appearance: String
    let onProfileChange: (NativeAccountProfile) -> Void
    let signOut: () -> Void
    let onSessionExpired: () -> Void
    @State private var appsOpen = false
    @State private var quickCapture = false
    @State private var appQuery = ""
    @State private var visited: Set<InFliteRoute> = [.today]
    @State private var revisions: [InFliteRoute: Int] = [:]

    private let pins: [InFliteRoute] = [.today, .weather, .markets, .fitness, .mail]
    private let apps: [InFliteRoute] = [
        .calendar, .notes, .reminders, .people, .files, .fitness, .weather, .markets, .chats, .mail, .status, .account
    ]
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
                .id(route == .today ? 0 : revisions[route, default: 0])
                .opacity(destination == route ? 1 : 0)
                .allowsHitTesting(destination == route)
                .accessibilityHidden(destination != route)
                .zIndex(destination == route ? 1 : 0)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .onChange(of: destination, initial: true) { _, route in visited.insert(route) }
        .sheet(isPresented: $appsOpen, onDismiss: { appQuery = "" }) { appLibrary }
        .sheet(isPresented: $quickCapture) {
            NativeQuickCapture(owner: user.id) { route in
                revisions[.today, default: 0] += 1
                if let route {
                    revisions[route, default: 0] += 1
                    destination = route
                }
            }
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
            NativeTodayView(
                user: user, initialToday: initialToday, preview: preview, captureRevision: revisions[.today, default: 0]
            ) {
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
        case .chats:
            NativeChatsView(owner: user.id, active: destination == .chats)
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
            NativeAccountView(user: user, appearance: $appearance, signOut: signOut, onProfileChange: onProfileChange) {
                destination = $0
            }
        case .notifications:
            NativeNotificationsView(owner: user.id) { destination = $0 }
        case .reminders:
            NativeRemindersView(owner: user.id, revision: revisions[.today, default: 0]) {
                revisions[.today, default: 0] += 1
            }
        case .about, .privacy, .support, .storage, .terms:
            if let page = route.publicPage {
                NativePublicPageView(page: page, initialName: user.name)
                    .navigationDestination(for: NativePublicPage.self) {
                        NativePublicPageView(page: $0, initialName: user.name)
                    }
            }
        }
    }
}
