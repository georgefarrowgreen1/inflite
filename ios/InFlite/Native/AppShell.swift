import SwiftUI
import UIKit

@MainActor
struct NativeRootView: View {
    private enum Phase {
        case opening, signedOut, ready(BackendUser), unavailable
    }

    private enum RootSheet: Identifiable {
        case signIn
        case publicPage(InFliteRoute)
        case passwordReset(NativePasswordResetLink)
        case computerSignIn(String)

        var id: String {
            switch self {
            case .signIn: "sign-in"
            case .publicPage(let route): "public-\(route.rawValue)"
            case .passwordReset(let link): "password-reset-\(link.id)"
            case .computerSignIn: "computer-sign-in"
            }
        }
    }

    @State private var phase: Phase = .opening
    @State private var initialToday: BackendToday?
    @State private var cachedToday: TodayPresentationSnapshot?
    @State private var destination: InFliteRoute = .today
    @State private var pendingRoute: InFliteRoute?
    @State private var sheet: RootSheet?
    @State private var pendingComputerCode: String?
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
                if let cachedToday {
                    CachedTodayView(snapshot: cachedToday, refreshing: true) { reload += 1 }
                } else {
                    ProgressView("Opening InFlite")
                        .accessibilityIdentifier("opening-inflite")
                }
            case .signedOut:
                welcome
            case .unavailable:
                if let cachedToday {
                    CachedTodayView(snapshot: cachedToday, refreshing: false) { reload += 1 }
                        .safeAreaInset(edge: .bottom) {
                            Button("InFlite Status") { open(.status) }
                                .padding(.vertical, 8)
                        }
                } else {
                    ContentUnavailableView {
                        Label("InFlite couldn’t connect", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text("Check your connection and try again.")
                    } actions: {
                        Button("Try again") { reload += 1 }
                            .buttonStyle(.borderedProminent)
                        Button("InFlite Status") { open(.status) }
                    }
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
        .sheet(item: $sheet, onDismiss: showPendingComputerSignIn) { item in
            rootSheet(item).nativeSheetChrome()
        }
        .onOpenURL { _ = openLink($0) }
        .environment(\.openURL, OpenURLAction { openLink($0) ? .handled : .systemAction })
    }

    @ViewBuilder
    private func rootSheet(_ item: RootSheet) -> some View {
        switch item {
        case .signIn:
            BackendSignInView(onComplete: accept)
        case .publicPage(let route):
            if let page = route.publicPage { NativePublicSheet(page: page) }
            else { PublicStatusSheet() }
        case .passwordReset(let link):
            if case .signedOut = phase {
                NativePasswordResetView(link: link, client: .shared, onSignIn: accept)
            } else {
                NativePasswordResetView(link: link, onComplete: { reload += 1 })
            }
        case .computerSignIn(let code):
            if case .ready(let user) = phase {
                NavigationStack {
                    NativeComputerSignInView(owner: user.id, initialCode: code)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                NativeSheetCloseButton { sheet = nil }
                            }
                        }
                }
            }
        }
    }

    private func openLink(_ url: URL) -> Bool {
        if let link = NativePasswordResetLink(url: url) {
            sheet = .passwordReset(link)
        } else if let code = BackendIdentityLink.secret(from: url, key: "qr", length: 32) {
            if case .ready = phase {
                sheet = .computerSignIn(code)
            } else {
                pendingComputerCode = code
                if case .signedOut = phase { sheet = .signIn }
            }
        } else if let route = InFliteRoute(link: url) {
            open(route)
        } else {
            return false
        }
        return true
    }

    private func open(_ route: InFliteRoute) {
        if case .ready = phase {
            destination = route
        } else if route.publicPage != nil || route == .status {
            sheet = .publicPage(route)
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
                    sheet = .signIn
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
        if ProcessInfo.processInfo.arguments.contains("--ui-test-cached-today") {
            cachedToday = reload == 0 ? TodayPresentationSnapshot.smokeSample : nil
            phase = reload == 0 ? .unavailable : .signedOut
            return
        }
        #endif
        let snapshot = try? await BackendClient.shared.cachedTodayPresentation()
        guard !Task.isCancelled else { return }
        cachedToday = snapshot
        do {
            let response = try await BackendClient.shared.bootstrap()
            guard !Task.isCancelled else { return }
            initialToday = response.cards
            accept(response.view)
        } catch let error as BackendError where error.isAuthenticationRequired {
            guard !Task.isCancelled else { return }
            accept(BackendSession(signedIn: false, user: nil, prefs: nil, apps: nil))
        } catch {
            // Recheck the cached presentation. Bootstrap can revoke the local
            // credential or invalidate the snapshot while it is visible.
            let snapshot = try? await BackendClient.shared.cachedTodayPresentation()
            guard !Task.isCancelled else { return }
            cachedToday = snapshot
            phase = .unavailable
        }
    }

    private func accept(_ session: BackendSession) {
        cachedToday = nil
        guard session.signedIn, let user = session.user else {
            initialToday = nil
            phase = .signedOut
            if pendingComputerCode != nil, sheet == nil { sheet = .signIn }
            return
        }
        destination = pendingRoute ?? .today
        pendingRoute = nil
        phase = .ready(user)
        if sheet == nil { showPendingComputerSignIn() }
    }

    private func showPendingComputerSignIn() {
        guard case .ready = phase, let code = pendingComputerCode else { return }
        pendingComputerCode = nil
        sheet = .computerSignIn(code)
    }

    private func resetSession() {
        initialToday = nil
        cachedToday = nil
        pendingRoute = nil
        pendingComputerCode = nil
        sheet = nil
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
        let formerOwner: String?
        if case .ready(let user) = phase { formerOwner = user.id }
        else { formerOwner = nil }
        do {
            try await BackendClient.shared.signOut()
            if let formerOwner {
                QuickCaptureDraftStore.clear(owner: formerOwner)
                await NativeNotificationStore.shared.forget(owner: formerOwner)
            }
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
                    ToolbarItem(placement: .confirmationAction) {
                        NativeSheetCloseButton { dismiss() }
                    }
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
    @State private var keyboardVisible = false
    @State private var editedPins: [InFliteRoute]?
    @State private var visited: Set<InFliteRoute> = [.today]
    @State private var revisions: [InFliteRoute: Int] = [:]
    @State private var agendaLaunch: TodayAgendaLaunch?
    @State private var captureConfirmation: CaptureConfirmation?

    private struct CaptureConfirmation: Identifiable {
        let id = UUID()
        let receipt: QuickCaptureReceipt
    }

    private var pinnedApps: [InFliteRoute] {
        editedPins ?? NativeDockPins.load(owner: user.id)
    }

    var body: some View {
        ZStack {
            ForEach(InFliteRoute.allCases.filter { visited.contains($0) || $0 == destination }, id: \.rawValue) { route in
                NavigationStack {
                    screen(route)
                }
                .environment(\.isInFliteScreenVisible, destination == route)
                .opacity(destination == route ? 1 : 0)
                .allowsHitTesting(destination == route)
                .accessibilityHidden(destination != route)
                .zIndex(destination == route ? 1 : 0)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 8) {
                if let captureConfirmation, destination == .today, !quickCapture {
                    savedBanner(captureConfirmation.receipt)
                }
                if !keyboardVisible {
                    NativeDockBar(pinnedApps: pinnedApps, active: destination) {
                        destination = $0
                    } showApps: {
                        appsOpen = true
                    }
                }
            }
        }
        .onChange(of: destination, initial: true) { _, route in visited.insert(route) }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { _ in
            keyboardVisible = false
        }
        .sheet(isPresented: $appsOpen) {
            NativeAppLibrary(
                active: destination, pinnedApps: Binding(get: { pinnedApps }, set: savePins)
            ) { app in
                destination = app
                appsOpen = false
            }
            .nativeSheetChrome()
        }
        .sheet(isPresented: $quickCapture) {
            NativeQuickCapture(owner: user.id) { receipt in
                revisions[.today, default: 0] += 1
                if receipt.destination != .reminders { revisions[receipt.destination, default: 0] += 1 }
                captureConfirmation = CaptureConfirmation(receipt: receipt)
            }
            .nativeSheetChrome()
        }
        .task(id: captureConfirmation?.id) {
            guard let id = captureConfirmation?.id else { return }
            let seconds = UIAccessibility.isVoiceOverRunning ? 12 : 6
            do { try await Task.sleep(for: .seconds(seconds)) } catch { return }
            if captureConfirmation?.id == id { captureConfirmation = nil }
        }
    }

    private func savePins(_ apps: [InFliteRoute]) {
        editedPins = apps
        NativeDockPins.save(apps, owner: user.id)
    }

    private func savedBanner(_ receipt: QuickCaptureReceipt) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                captureStatus(receipt)
                Spacer(minLength: 8)
                openCapture(receipt)
            }
            VStack(alignment: .leading, spacing: 4) {
                captureStatus(receipt)
                openCapture(receipt)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(.regularMaterial, in: .rect(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20)
                .strokeBorder(.primary.opacity(0.13), lineWidth: 1)
                .allowsHitTesting(false)
        }
        .frame(maxWidth: 540)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("quick-capture-saved")
        .onAppear { UIAccessibility.post(notification: .announcement, argument: receipt.title) }
    }

    private func captureStatus(_ receipt: QuickCaptureReceipt) -> some View {
        Label(receipt.title, systemImage: "checkmark.circle.fill")
            .font(.subheadline.weight(.semibold))
    }

    private func openCapture(_ receipt: QuickCaptureReceipt) -> some View {
        Button("Open") {
            captureConfirmation = nil
            destination = receipt.destination
        }
        .font(.subheadline.weight(.semibold))
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityLabel("Open \(receipt.destination.title)")
    }

    @ViewBuilder
    private func screen(_ route: InFliteRoute) -> some View {
        switch route {
        case .today:
            NativeTodayView(
                user: user, initialToday: initialToday, preview: preview, captureRevision: revisions[.today, default: 0],
                openAgendaItem: { target in
                    agendaLaunch = TodayAgendaLaunch(destination: target)
                    destination = target.route
                },
                onAgendaChanged: {
                    revisions[.today, default: 0] += 1
                }
            ) {
                destination = $0
            } capture: {
                quickCapture = true
            } onSessionExpired: {
                onSessionExpired()
            }
            .toolbar(.hidden, for: .navigationBar)
        case .weather:
            NativeWeatherView(owner: user.id, agendaLaunch: agendaLaunch)
        case .markets:
            ActivityMarketsView(owner: user.id)
        case .fitness:
            ActivityFitnessView(owner: user.id, agendaLaunch: agendaLaunch)
        case .mail:
            NativeMailView(owner: user.id, active: destination == .mail, agendaLaunch: agendaLaunch)
        case .chats:
            NativeChatsView(owner: user.id, active: destination == .chats, agendaLaunch: agendaLaunch)
        case .calendar:
            NativeCalendarView(owner: user.id)
        case .notes:
            NativeNotesView(owner: user.id, revision: revisions[.notes, default: 0])
        case .files:
            NativeFilesView(owner: user.id, revision: revisions[.files, default: 0])
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

private enum NativeDockPins {
    static let capacity = 4
    static let defaultApps: [InFliteRoute] = [.weather, .markets, .fitness, .mail]
    static let availableApps: [InFliteRoute] = [
        .calendar, .notes, .reminders, .people, .files, .fitness,
        .weather, .markets, .chats, .mail, .status, .account
    ]

    static func load(owner: String) -> [InFliteRoute] {
        guard let saved = UserDefaults.standard.stringArray(forKey: key(owner)) else { return defaultApps }
        var seen = Set<InFliteRoute>()
        return Array(saved.compactMap { InFliteRoute(rawValue: $0) }
            .filter { availableApps.contains($0) && seen.insert($0).inserted }
            .prefix(capacity))
    }

    static func save(_ apps: [InFliteRoute], owner: String) {
        UserDefaults.standard.set(apps.map(\.rawValue), forKey: key(owner))
    }

    private static func key(_ owner: String) -> String {
        "inflite.native.dock.pins.\(owner)"
    }
}

private struct NativeDockBar: View {
    let pinnedApps: [InFliteRoute]
    let active: InFliteRoute
    let open: (InFliteRoute) -> Void
    let showApps: () -> Void
    @Environment(\.dynamicTypeSize) private var textSize

    private enum Labels {
        case singleLine, wrapped, iconsOnly
    }

    private var launcherSelection: InFliteRoute? {
        active == .today || pinnedApps.contains(active) ? nil : active
    }

    var body: some View {
        Group {
            if textSize.isAccessibilitySize {
                bar(pinnedApps.contains(active) ? [.today, active] : [.today], labels: .wrapped)
            } else {
                ViewThatFits(in: .horizontal) {
                    bar([.today] + pinnedApps, labels: .singleLine)
                    bar([.today] + pinnedApps, labels: .iconsOnly)
                }
            }
        }
        .padding(5)
        .background(.regularMaterial, in: .rect(cornerRadius: 25))
        .overlay {
            RoundedRectangle(cornerRadius: 25)
                .strokeBorder(.primary.opacity(0.13), lineWidth: 1)
                .allowsHitTesting(false)
        }
        .frame(maxWidth: 540)
        .padding(.horizontal, 16)
        .padding(.bottom, 5)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("native-dock")
    }

    private func bar(_ routes: [InFliteRoute], labels: Labels) -> some View {
        HStack(spacing: 3) {
            ForEach(routes) { route in
                Button { open(route) } label: {
                    item(route.title, labels: labels, selected: active == route) {
                        NativeAppIcon(route: route, size: 29)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("dock-\(route.rawValue)")
                .accessibilityLabel(route.title)
                .accessibilityAddTraits(active == route ? .isSelected : [])
            }
            Divider().frame(height: 31)
            Button(action: showApps) {
                item(launcherSelection?.title ?? "Apps", labels: labels, selected: launcherSelection != nil) {
                    if let selected = launcherSelection {
                        NativeAppIcon(route: selected, size: 29)
                            .overlay(alignment: .bottomTrailing) {
                                Image(systemName: "square.grid.2x2.fill")
                                    .font(.system(size: 8, weight: .bold))
                                    .padding(3)
                                    .background(Color(uiColor: .secondarySystemBackground), in: .circle)
                                    .offset(x: 4, y: 3)
                            }
                    } else {
                        Image(systemName: "square.grid.2x2")
                            .font(.system(size: 23, weight: .medium))
                            .frame(width: 29, height: 29)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("dock-apps")
            .accessibilityLabel("Apps")
            .accessibilityValue(launcherSelection?.title ?? "")
            .accessibilityAddTraits(launcherSelection == nil ? [] : .isSelected)
        }
    }

    private func item<Icon: View>(
        _ title: String, labels: Labels, selected: Bool, @ViewBuilder icon: () -> Icon
    ) -> some View {
        VStack(spacing: 4) {
            icon().accessibilityHidden(true)
            if labels != .iconsOnly {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(labels == .wrapped ? 2 : 1)
                    .fixedSize(horizontal: labels == .singleLine, vertical: true)
            }
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, labels == .singleLine ? 4 : 1)
        .padding(.vertical, 5)
        .frame(minWidth: 44, maxWidth: .infinity, minHeight: labels == .iconsOnly ? 48 : 55)
        .background(selected ? Color.accentColor.opacity(0.16) : .clear, in: .rect(cornerRadius: 19))
        .contentShape(.rect)
    }
}

private struct NativeAppLibrary: View {
    let active: InFliteRoute
    @Binding var pinnedApps: [InFliteRoute]
    let open: (InFliteRoute) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var query = ""

    private var normalizedQuery: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var visibleApps: [InFliteRoute] {
        NativeDockPins.availableApps.filter {
            normalizedQuery.isEmpty || $0.title.localizedCaseInsensitiveContains(normalizedQuery)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if visibleApps.isEmpty {
                    ContentUnavailableView.search(text: normalizedQuery)
                        .padding(.top, 24)
                } else if textSize.isAccessibilitySize {
                    LazyVStack(spacing: 6) {
                        ForEach(visibleApps) { app in
                            appButton(app) {
                                HStack(spacing: 12) {
                                    NativeAppIcon(route: app, size: 34)
                                    Text(app.title).font(.body)
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }
                    .padding(NativeStyle.sheetInset)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 12)], spacing: 12) {
                        ForEach(visibleApps) { app in
                            appButton(app) {
                                VStack(spacing: 8) {
                                    NativeAppIcon(route: app, size: 44)
                                    Text(app.title)
                                        .font(.subheadline)
                                        .multilineTextAlignment(.center)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                    .padding(NativeStyle.sheetInset)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .searchable(text: $query, prompt: "Search apps")
            .navigationTitle("Your apps")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        NativeDockEditor(pinnedApps: $pinnedApps)
                    } label: {
                        if textSize.isAccessibilitySize {
                            Label("Edit Dock", systemImage: "pin")
                                .labelStyle(.iconOnly)
                        } else {
                            Text("Edit Dock")
                        }
                    }
                    .accessibilityIdentifier("edit-dock")
                }
                ToolbarItem(placement: .confirmationAction) {
                    NativeSheetCloseButton { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func appButton<Label: View>(_ app: InFliteRoute, @ViewBuilder label: () -> Label) -> some View {
        Button { open(app) } label: {
            label()
                .padding(8)
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(.primary)
                .background(active == app ? Color.accentColor.opacity(0.14) : .clear, in: .rect(cornerRadius: 16))
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("app-\(app.rawValue)")
        .accessibilityAddTraits(active == app ? .isSelected : [])
        .contextMenu {
            if pinnedApps.contains(app) {
                Button("Unpin from Dock", systemImage: "pin.slash") {
                    pinnedApps.removeAll { $0 == app }
                }
            } else {
                Button("Pin to Dock", systemImage: "pin") { pinnedApps.append(app) }
                    .disabled(pinnedApps.count >= NativeDockPins.capacity)
            }
        }
    }
}

private struct NativeDockEditor: View {
    @Binding var pinnedApps: [InFliteRoute]

    var body: some View {
        List {
            Section {
                if pinnedApps.isEmpty {
                    Text("Choose apps below to add them to your dock.")
                        .foregroundStyle(.secondary)
                }
                ForEach(pinnedApps) { app in
                    pinRow(app, isPinned: true)
                }
                .onMove { source, destination in
                    pinnedApps.move(fromOffsets: source, toOffset: destination)
                }
            } header: {
                Text("Pinned")
            } footer: {
                if pinnedApps.count >= NativeDockPins.capacity {
                    Text("Remove a pin before adding another app.")
                }
            }
            Section("Available apps") {
                ForEach(NativeDockPins.availableApps.filter { !pinnedApps.contains($0) }) { app in
                    pinRow(app, isPinned: false)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Edit Dock")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if pinnedApps.count > 1 {
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
            }
        }
    }

    private func pinRow(_ app: InFliteRoute, isPinned: Bool) -> some View {
        Button {
            if isPinned { pinnedApps.removeAll { $0 == app } }
            else if pinnedApps.count < NativeDockPins.capacity { pinnedApps.append(app) }
        } label: {
            HStack(spacing: 12) {
                NativeAppIcon(route: app, size: 30)
                Text(app.title).foregroundStyle(.primary)
                Spacer()
                Image(systemName: isPinned ? "minus.circle" : "plus.circle")
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.borderless)
        .disabled(!isPinned && pinnedApps.count >= NativeDockPins.capacity)
        .accessibilityIdentifier("edit-dock-\(app.rawValue)")
        .accessibilityLabel(app.title)
        .accessibilityValue(isPinned ? "Pinned" : "Not pinned")
        .accessibilityHint(isPinned ? "Removes from the dock" : "Adds to the dock")
    }
}
