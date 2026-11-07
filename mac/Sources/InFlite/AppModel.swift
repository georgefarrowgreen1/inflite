import AppKit
import SwiftUI
import WebKit
import InFliteCore

@MainActor
final class AppModel: ObservableObject {
    @Published var selection: Destination = .today
    @Published var showFind = false
    @Published var showingSignIn = false
    @Published var page: BrowserPage?
    @Published var session: SessionView?
    @Published var day: TodayEnvelope?
    @Published var refreshing = false
    @Published var hasLoaded = false
    @Published var message: String?
    @Published var lastUpdated: Date?
    @Published var quietSettings: QuietHours?
    @Published var settingsMessage: String?
    let service = TodayService()
    let sampleData: Bool
    private let fixturePath: String?
    private var generation = 0
    var currentPage: BrowserPage? { selection.isNative ? nil : page }
    var signedIn: Bool { session?.signedIn == true }
    var userName: String { session?.user?.name ?? "Your account" }

    init() {
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--fixture-path"), i + 1 < args.count { fixturePath = args[i + 1] } else { fixturePath = nil }
        sampleData = fixturePath != nil
        if let i = args.firstIndex(of: "--screen"), i + 1 < args.count, let target = Destination(rawValue: args[i + 1]), target.isNative { selection = target }
    }

    func refresh(force: Bool = false) async {
        if force { generation += 1; refreshing = false }
        guard !refreshing else { return }
        refreshing = true
        let turn = generation
        defer { if turn == generation { refreshing = false } }
        do {
            let boot: TodayBoot
            if let fixturePath { boot = try JSONDecoder().decode(TodayBoot.self, from: Data(contentsOf: URL(fileURLWithPath: fixturePath))) }
            else { boot = try await service.request(.boot) }
            guard turn == generation else { return }
            if session?.user?.id != boot.view.user?.id { quietSettings = nil; settingsMessage = nil }
            session = boot.view
            day = boot.view.signedIn ? boot.cards : nil
            message = nil
            hasLoaded = true
            lastUpdated = Date()
            if boot.view.signedIn && boot.cards == nil && !sampleData {
                let cards: TodayEnvelope = try await service.request(.cards)
                guard turn == generation else { return }
                day = cards
            }
            if signedIn { showingSignIn = false }
            captureReport(loaded: true)
        } catch TodayServiceError.accountChanged {
            guard turn == generation else { return }
            session = nil; day = nil; quietSettings = nil; hasLoaded = true
            message = TodayServiceError.accountChanged.localizedDescription
            captureReport(loaded: false)
        } catch TodayServiceError.signedOut {
            guard turn == generation else { return }
            session = nil; day = nil; quietSettings = nil; hasLoaded = true
            message = "Your sign-in has ended. Sign in again."
            captureReport(loaded: true)
        } catch {
            guard turn == generation else { return }
            hasLoaded = true; message = error.localizedDescription
            captureReport(loaded: false)
        }
    }

    func select(_ destination: Destination) {
        guard !sampleData || destination.isNative else { return }
        selection = destination
        guard !destination.isNative else { return }
        openWeb(destination.url!)
    }
    func openWeb(_ url: URL) {
        guard !sampleData else { return }
        guard NavigationPolicy.isInternal(url) else { return }
        if let page { page.webView.load(URLRequest(url: url)) }
        else {
            let browser = BrowserPage(url: url)
            browser.onNavigationFinished = { [weak self] in
                guard let self else { return }
                Task { await self.refresh(force: true) }
            }
            page = browser
        }
    }
    func signIn() { guard !sampleData else { return }; openWeb(Destination.today.url!); showingSignIn = true }
    func showWebToday() { guard !sampleData else { return }; selection = .webToday; openWeb(Destination.today.url!) }
    func openInBrowser() {
        if let url = currentPage?.webView.url ?? selection.url, NavigationPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
    }
    func saveMorning(on: Bool, at: Int) async throws {
        guard !sampleData else { throw TodayServiceError.rejected("Sample preview: account changes are disabled.") }
        let _: MorningSettings = try await service.request(.morning, method: "PUT", body: .object([
            "on": .bool(on), "at": .number(Double(at)), "tz": .string(day?.morning?.tz ?? TimeZone.current.identifier)
        ]))
        await refresh(force: true)
    }
    func saveQuiet(_ hours: QuietHours) async throws {
        guard !sampleData else { throw TodayServiceError.rejected("Sample preview: account changes are disabled.") }
        let _: JSONValue = try await service.request(.notifications, method: "PATCH", body: .object(["quiet": .object([
            "on": .bool(hours.on), "from": .number(Double(hours.from)), "to": .number(Double(hours.to)),
            "tz": .string(hours.tz ?? TimeZone.current.identifier)
        ])]))
        await refresh(force: true)
        await loadQuietSettings()
    }
    func loadQuietSettings() async {
        guard signedIn else { quietSettings = nil; return }
        if sampleData { quietSettings = session?.quiet; return }
        let turn = generation
        do {
            let reply: JSONValue = try await service.request(.notifications)
            guard turn == generation && signedIn else { return }
            quietSettings = try JSONDecoder().decode(QuietHours.self, from: JSONEncoder().encode(reply["quiet"]))
            settingsMessage = nil
        } catch { if turn == generation { settingsMessage = error.localizedDescription } }
    }
    func saveCards(hidden: [String]) async throws {
        guard !sampleData else { throw TodayServiceError.rejected("Sample preview: account changes are disabled.") }
        let _: JSONValue = try await service.request(.preferences, method: "PUT", body: .object([
            "hidden": .array(hidden.map { .string($0) })
        ]))
        await refresh(force: true)
    }
    func signOut() async throws {
        guard !sampleData else { throw TodayServiceError.rejected("Sample preview: account changes are disabled.") }
        let _: JSONValue = try await service.request(.logout, method: "POST", body: .object([:]))
        await clearLocalSession()
    }
    func clearLocalSession() async {
        generation += 1; refreshing = false
        session = nil; day = nil; quietSettings = nil; settingsMessage = nil; message = nil; lastUpdated = nil
        page?.webView.stopLoading(); page = nil; selection = .today
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
        await refresh()
    }
    private func captureReport(loaded: Bool) {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "--capture-report"), i + 1 < args.count else { return }
        let report: [String: Any] = ["loaded": loaded, "host": "inflite.ai", "surface": "SwiftUI", "sampleData": sampleData, "signedIn": signedIn]
        if let data = try? JSONSerialization.data(withJSONObject: report) { try? data.write(to: URL(fileURLWithPath: args[i + 1]), options: .atomic) }
    }
}
