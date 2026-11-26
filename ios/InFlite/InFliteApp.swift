import SwiftUI

@main
@MainActor
struct InFliteApp: App {
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-test-recovery") {
                BrowserScreen()
            } else {
                NativeRootView()
            }
            #else
            NativeRootView()
            #endif
        }
    }
}

#if DEBUG
@MainActor
private struct BrowserScreen: View {
    @StateObject private var browser = BrowserSession()

    var body: some View {
        ZStack {
            WebSurface(webView: browser.webView)
                .ignoresSafeArea(.container)
                .accessibilityHidden(browser.phase != .ready)
                .allowsHitTesting(browser.phase == .ready)

            switch browser.phase {
            case .opening:
                VStack(spacing: 24) {
                    BrandMark()
                    ProgressView("Opening InFlite")
                        .accessibilityIdentifier("opening-inflite")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(uiColor: .systemBackground).ignoresSafeArea())
            case .unavailable(let problem):
                recoveryView(problem)
            case .ready:
                EmptyView()
            }
        }
        .task { browser.start() }
        .onOpenURL { url in
            if let route = InFliteRoute(link: url) { browser.open(route) }
        }
        .sheet(item: $browser.sharedDownload, onDismiss: browser.clearSharedDownload) { download in
            DownloadShareSheet(file: download.file)
        }
        .alert("Download unavailable", isPresented: $browser.downloadFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Try downloading the file again.")
        }
    }

    private func recoveryView(_ problem: BrowserSession.Problem) -> some View {
        ScrollView {
            VStack(spacing: 18) {
                BrandMark()
                Text(problem.title)
                    .font(.title2.weight(.semibold))
                    .accessibilityAddTraits(.isHeader)
                Text(problem.message)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try again", action: browser.retry)
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("retry-inflite")
                Link("InFlite Status", destination: URL(string: "https://status.inflite.ai/")!)
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
        }
        .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        .accessibilityIdentifier("inflite-recovery")
    }
}

private struct BrandMark: View {
    var body: some View {
        Image("InFliteMark")
            .resizable()
            .scaledToFit()
            .frame(width: 68, height: 68)
            .clipShape(.rect(cornerRadius: 17))
            .accessibilityHidden(true)
    }
}
#endif
