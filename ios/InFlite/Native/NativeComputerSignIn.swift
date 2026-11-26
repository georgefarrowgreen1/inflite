import AVFoundation
import SwiftUI
import VisionKit

@MainActor
struct NativeComputerSignInView: View {
    let owner: String

    private struct Request: Decodable {
        let label: String
        let place: String?
        let far: String?
        let picks: [Int]
    }

    private struct Answer: Encodable {
        let code: String
        let num: Int?
    }

    private struct Verification: Identifiable {
        let id = UUID()
        let profile: NativeAccountProfile
        let action: Action
    }

    private enum Action {
        case inspect
        case respond(Int?)
    }

    @State private var scanning = false
    @State private var pastedLink = ""
    @State private var code: String?
    @State private var request: Request?
    @State private var number = ""
    @State private var working: Task<Void, Never>?
    @State private var verification: Verification?
    @State private var completion: String?
    @State private var issue: String?

    private var service: NativeAccountService { NativeAccountService(owner: owner) }

    var body: some View {
        Form {
            if let completion {
                Section { Label(completion, systemImage: "checkmark.circle") }
            } else if let request {
                match(request)
            } else if code != nil {
                Section {
                    Button("Continue") { start(.inspect) }
                    Button("Cancel", role: .cancel) { clear() }
                } header: {
                    Text("Review sign-in request")
                } footer: {
                    Text("Continue only if you opened this code yourself on the computer you’re using.")
                }
            } else {
                Section {
                    Button("Scan QR code", systemImage: "qrcode.viewfinder") {
                        Task { await showScanner() }
                    }
                } footer: {
                    Text("Open the InFlite sign-in page on the computer and choose Sign in with your phone.")
                }
                Section("Or paste the sign-in link") {
                    TextField("InFlite QR link", text: $pastedLink)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Button("Open sign-in request") { accept(pastedLink.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(pastedLink.isEmpty)
                }
            }
            if let issue { Section { Label(issue, systemImage: "exclamationmark.circle").foregroundStyle(.secondary) } }
            if working != nil { Section { ProgressView() } }
        }
        .navigationTitle("Sign in on a computer")
        .disabled(working != nil)
        .onDisappear { working?.cancel() }
        .sheet(isPresented: $scanning) { scanner }
        .sheet(item: $verification) { step in
            NativeAccountReauthenticationView(service: service, profile: step.profile) {
                verification = nil
                start(step.action, verified: true)
            }
        }
    }

    private var scanner: some View {
        NavigationStack {
            NativeComputerCodeScanner { link in
                guard Self.code(from: link) != nil else { return false }
                scanning = false
                accept(link)
                return true
            } onFailure: {
                scanning = false
                issue = "The camera couldn’t scan. Try again or paste the sign-in link."
            }
            .navigationTitle("Scan InFlite code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { scanning = false }
                }
            }
        }
    }

    private func match(_ request: Request) -> some View {
        Section {
            Label(request.label, systemImage: "laptopcomputer")
            if let place = request.place {
                LabeledContent("Approximate location", value: place)
            }
            if let far = request.far {
                Text(far == "elsewhere" ? "The computer appears to be in a different country." : "The computer’s location is unknown.")
                    .foregroundStyle(.secondary)
                TextField("Number on the computer", text: $number)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                Button("Sign in") {
                    if let pick = Int(number), (10...99).contains(pick) { start(.respond(pick)) }
                }
                    .disabled(number.range(of: "^[1-9][0-9]$", options: .regularExpression) == nil)
            } else {
                HStack {
                    ForEach(request.picks, id: \.self) { pick in
                        Button("\(pick)") { start(.respond(pick)) }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            Button("Decline sign-in", role: .destructive) { start(.respond(nil)) }
        } header: {
            Text(request.far == nil ? "Tap the number on the computer" : "Type the number on the computer")
        } footer: {
            Text("Approve only if the computer you’re using shows InFlite in its address bar and you opened the sign-in request yourself.")
        }
    }

    private func showScanner() async {
        issue = nil
        guard DataScannerViewController.isSupported else {
            issue = "This device can’t scan codes. Paste the sign-in link to continue."
            return
        }
        let authorized: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: authorized = true
        case .notDetermined: authorized = await AVCaptureDevice.requestAccess(for: .video)
        default: authorized = false
        }
        guard authorized, DataScannerViewController.isAvailable else {
            issue = "Allow camera access in Settings or paste the sign-in link."
            return
        }
        scanning = true
    }

    private func accept(_ link: String) {
        guard let parsed = Self.code(from: link) else {
            issue = "Enter an InFlite computer sign-in link."
            return
        }
        clear()
        code = parsed
        pastedLink = ""
    }

    private static func code(from link: String) -> String? {
        guard let url = URL(string: link) else { return nil }
        return BackendIdentityLink.secret(from: url, key: "qr", length: 32)
    }

    private func clear() {
        code = nil
        request = nil
        number = ""
        issue = nil
    }

    private func start(_ action: Action, verified: Bool = false) {
        guard working == nil, let code else { return }
        issue = nil
        working = Task {
            defer { working = nil }
            do {
                switch action {
                case .inspect:
                    let item = try await service.request(Request.self, "qr/look", method: "POST", changes: ["code": code])
                    guard item.picks.count == 3, Set(item.picks).count == 3,
                          item.picks.allSatisfy({ (10...99).contains($0) }) else { throw BackendError.invalidResponse }
                    request = item
                case .respond(let pick):
                    let answer = try JSONEncoder().encode(Answer(code: code, num: pick))
                    let result = try await BackendClient.shared.request(
                        NativeAccountAction.self, path: "/api/account/qr/answer", method: "POST",
                        body: answer, owner: owner, origin: .account
                    )
                    guard result.ok == (pick != nil) else { throw BackendError.invalidResponse }
                    clear()
                    completion = result.ok ? "Computer sign-in approved" : "Computer sign-in declined"
                }
            } catch is CancellationError {
                return
            } catch BackendError.http(403, _) where !verified {
                do {
                    verification = Verification(profile: try await service.profile(), action: action)
                } catch {
                    issue = error.localizedDescription
                }
            } catch BackendError.http(let status, let detail) where [400, 409, 410].contains(status) {
                clear()
                issue = detail ?? "This sign-in code is no longer available."
            } catch {
                issue = error.localizedDescription
            }
        }
    }
}

private struct NativeComputerCodeScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Bool
    let onFailure: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onCode: onCode)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() }
        catch { Task { @MainActor in onFailure() } }
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onCode: (String) -> Bool
        private var finished = false

        init(onCode: @escaping (String) -> Bool) {
            self.onCode = onCode
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !finished else { return }
            for item in addedItems {
                guard case .barcode(let barcode) = item, let payload = barcode.payloadStringValue else { continue }
                if onCode(payload) {
                    finished = true
                    dataScanner.stopScanning()
                    return
                }
            }
        }
    }
}
