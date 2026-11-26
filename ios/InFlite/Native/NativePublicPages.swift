import SwiftUI

enum NativePublicPage: String, Identifiable {
    case about, contact, privacy, storage, terms

    var id: String { rawValue }

    var title: String {
        switch self {
        case .about: "About InFlite"
        case .contact: "Contact Us"
        case .privacy: "Privacy notice"
        case .storage: "Cookies & storage"
        case .terms: "Terms of use"
        }
    }
}

struct NativePublicSheet: View {
    let page: NativePublicPage
    var initialName: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            NativePublicPageView(page: page, initialName: initialName)
                .navigationDestination(for: NativePublicPage.self) { destination in
                    NativePublicPageView(page: destination, initialName: initialName)
                }
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .tint(NativeStyle.accent)
    }
}

struct NativePublicPageView: View {
    let page: NativePublicPage
    var initialName: String? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                switch page {
                case .about: about
                case .contact: NativeContactForm(initialName: initialName)
                case .privacy, .storage, .terms: legal
                }
            }
            .frame(maxWidth: 620)
            .padding(20)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background { NativeWallpaper(animate: false) }
        .navigationTitle(page.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var about: some View {
        Group {
            NativeCard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        Image("InFliteMark").resizable().scaledToFit()
                            .frame(width: 46, height: 46)
                            .clipShape(.rect(cornerRadius: 11))
                            .accessibilityHidden(true)
                        Text("InFlite").font(.headline)
                        Text("a GFG company").foregroundStyle(.secondary)
                    }
                    Text("Make room for your day.")
                        .font(.largeTitle.bold())
                        .accessibilityAddTraits(.isHeader)
                    Text("See what’s ahead in Today, then move between your plans, conversations and favourite apps.")
                        .foregroundStyle(.secondary)
                }
            }
            NativeCard {
                VStack(alignment: .leading, spacing: 14) {
                    pageLink(.contact, systemImage: "envelope")
                    Divider()
                    pageLink(.privacy, systemImage: "hand.raised")
                    Divider()
                    pageLink(.storage, systemImage: "internaldrive")
                    Divider()
                    pageLink(.terms, systemImage: "doc.text")
                }
            }
        }
    }

    private var legal: some View {
        let document = NativeLegalDocument.document(for: page)
        return Group {
            NativeCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(page.title).font(.title.bold()).accessibilityAddTraits(.isHeader)
                    Text("18 November 2026").font(.caption).foregroundStyle(.secondary)
                    legalText(document.introduction)
                }
            }
            ForEach(document.sections, id: \.title) { section in
                NativeCard {
                    VStack(alignment: .leading, spacing: 9) {
                        Text(section.title).font(.headline).accessibilityAddTraits(.isHeader)
                        ForEach(section.paragraphs, id: \.self) { paragraph in
                            legalText(paragraph)
                        }
                    }
                }
            }
        }
    }

    private func legalText(_ text: String) -> Text {
        if let content = try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return Text(content)
        }
        return Text(verbatim: text)
    }

    private func pageLink(_ page: NativePublicPage, systemImage: String) -> some View {
        NavigationLink(value: page) {
            HStack {
                Label(page.title, systemImage: systemImage)
                    .foregroundStyle(.primary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct NativeContactForm: View {
    private struct Fields: Encodable, Equatable {
        var name: String
        var email: String
        var message: String
        let website = ""

        var valid: Bool {
            !name.isEmpty && name.utf16.count <= 100 && email.utf16.count <= 254
                && email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
                && !message.isEmpty && message.utf16.count <= 4_000
        }
    }

    @State private var name: String
    @State private var email = ""
    @State private var message = ""
    @State private var attempt: (fields: Fields, key: String)?
    @State private var sending = false
    @State private var confirmation = false
    @State private var failure: String?
    @FocusState private var messageFocused: Bool

    init(initialName: String?) { _name = State(initialValue: initialName ?? "") }

    var body: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Get in touch.").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                Text("Questions, feedback or a little help? Send a note to the InFlite team. We’ll use your email to reply.")
                    .foregroundStyle(.secondary)
            }
        }
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Your name", text: $name).textContentType(.name)
                    .textFieldStyle(.roundedBorder)
                TextField("Email address", text: $email).textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                TextField("Message", text: $message, axis: .vertical)
                    .lineLimit(5...10)
                    .textFieldStyle(.roundedBorder)
                    .focused($messageFocused)
                Button {
                    Task { await submit() }
                } label: {
                    Group {
                        if sending { ProgressView("Sending") }
                        else { Label("Send message", systemImage: "arrow.up.right") }
                    }
                    .frame(maxWidth: .infinity, minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .disabled(sending || name.isEmpty || email.isEmpty || message.isEmpty)
                if confirmation {
                    Label("Message received. Thank you for getting in touch.", systemImage: "checkmark.circle")
                        .foregroundStyle(NativeStyle.accent)
                }
                if let failure { Text(failure).foregroundStyle(.secondary) }
            }
            .disabled(sending)
        }
        NativeCard {
            VStack(alignment: .leading, spacing: 12) {
                Link("Email hello@inflite.ai", destination: URL(string: "mailto:hello@inflite.ai")!)
                Link("Privacy requests", destination: URL(string: "mailto:privacy@inflite.ai")!)
                NavigationLink(NativePublicPage.privacy.title, value: NativePublicPage.privacy)
            }
        }
        .interactiveDismissDisabled(sending)
    }

    @MainActor
    private func submit() async {
        guard !sending else { return }
        confirmation = false
        failure = nil
        let fields = Fields(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            message: message.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        guard fields.valid else {
            failure = "Enter your name, a valid email address and a message of up to 4,000 characters."
            return
        }
        let key = attempt.flatMap { $0.fields == fields ? $0.key : nil } ?? UUID().uuidString.lowercased()
        attempt = (fields, key)
        sending = true
        messageFocused = false
        defer { sending = false }
        do {
            var request = URLRequest(url: InFliteRoute.origin.appending(path: "api/contact"), timeoutInterval: 15)
            request.httpMethod = "POST"
            request.httpShouldHandleCookies = false
            request.setValue("https://inflite.ai", forHTTPHeaderField: "Origin")
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            request.httpBody = try encoder.encode(fields)
            let (data, response) = try await NativeContactTransport.session.data(for: request)
            guard let response = response as? HTTPURLResponse, response.url == request.url else {
                throw BackendError.invalidResponse
            }
            switch response.statusCode {
            case 201:
                struct Response: Decodable { let ok: Bool }
                guard try JSONDecoder().decode(Response.self, from: data).ok else { throw BackendError.invalidResponse }
                message = ""
                attempt = nil
                confirmation = true
            case 400, 413:
                failure = "Check your name, email and message, then try again."
            case 429:
                failure = "Too many messages in a short time. Please try again later."
            default:
                throw BackendError.invalidResponse
            }
        } catch {
            if !Task.isCancelled {
                failure = "Delivery couldn’t be confirmed. Your message is still here. You can also email hello@inflite.ai."
            }
        }
    }
}

private final class NativeContactTransport: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        return URLSession(configuration: configuration, delegate: NativeContactTransport(), delegateQueue: nil)
    }()

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

// Mirrors the public InFlite notices shipped with this version of the app.
private struct NativeLegalDocument {
    let introduction: String
    let sections: [(title: String, paragraphs: [String])]

    static func document(for page: NativePublicPage) -> Self {
        switch page {
        case .storage: storage
        case .terms: terms
        default: privacy
        }
    }

    static let privacy = Self(
        introduction: "InFlite operates this website and the InFlite apps from the United Kingdom. You can read the public pages without an account. Signing in lets the apps recognise you and share information when you use a connected feature.",
        sections: [
            ("What we use and why", [
                "**Visiting the site.** To deliver pages, diagnose faults and protect the service, our hosting infrastructure processes your IP address, the page requested, the time and browser information.",
                "**Signing in.** We use your name or handle, email address, sign-in credentials, profile details and device sessions to run your account. Device, network and approximate region information help you recognise sign-ins and help us investigate unusual activity.",
                "**Using the apps.** We store what you add or receive, including mail and attachments, chat messages, contacts, calendar events, notes and files. The apps use that information to deliver, organise, search and sync your content. For example, Mail can suggest recipients from People, and device handoff can show an open app on another signed-in device. People can display your Chat friends’ names and handles while Chats is unlocked. The contact details you choose to save in People stay in your account.",
                "**Weather and Fitness.** Weather uses places you enter or a location you allow it to access. Fitness can use routes, activity files and training measures. Connecting Garmin or Strava can import data about you, including heart rate and, where available, sleep and recovery information. A connection may store an access token or provider key so that imports can continue.",
                "**Getting in touch.** We use the name, email address and message you send through Contact or by email to answer your enquiry. Authorised support staff can read it in the support inbox. The inbox records when a message arrived and when it was read. Enquiries stay there until an administrator deletes them. The form uses short-lived, keyed network identifiers to limit repeated submissions. Email [hello@inflite.ai](mailto:hello@inflite.ai) for support."
            ]),
            ("Who receives information", [
                "Cloudflare hosts the service, its databases and file storage, and provides email routing. Depending on the feature and configuration, delivery may use Cloudflare or Resend. An email recipient and their mail provider receive what you send. If you turn on notifications, your browser or device’s push service handles delivery.",
                "Forecast services such as Open-Meteo and MET Norway receive the location needed for the forecast. Optional features contact their own providers, for example Garmin or Strava for an import, or GIPHY for a GIF search. People you message or share an item with can keep a copy. Consider what you want them to see before sharing a file or a route."
            ]),
            ("How long information stays", [
                "The retention period depends on the feature. Notes and files are kept so you can return to them. Chat’s pigeon messages are normally cleared around 30 days after delivery, loss or recall. Some wait longer for a flight to be recorded, and the flight summary can remain after the message goes. A request to delete your account starts a seven-day cancellation period. The service can also remove accounts after a year of inactivity, with a warning sent to the account email."
            ]),
            ("Providers outside the UK", [
                "Where data is handled can depend on the provider, the connected service you choose and where the recipient of your message is based. For information about a particular transfer and the safeguards that apply, contact [privacy@inflite.ai](mailto:privacy@inflite.ai)."
            ]),
            ("Your controls and rights", [
                "Open Settings, then Account & security, to edit your profile and review sign-in activity. Under Your data you can download account information or request account deletion. You can also disconnect linked services and change location or notification permissions on your device.",
                "For a privacy request, write to [privacy@inflite.ai](mailto:privacy@inflite.ai). Under UK data protection law, you can ask for access, correction or erasure and, where applicable, restriction, portability or an objection to processing. Where processing depends on your consent, you can withdraw it. We may need to check your identity to protect your account. You can also [complain to the UK Information Commissioner’s Office](https://ico.org.uk/make-a-complaint/)."
            ])
        ]
    )

    static let storage = Self(
        introduction: "InFlite uses cookies and other storage on your device to keep you signed in, remember your choices and reopen your apps. What is stored depends on the features you use.",
        sections: [
            ("Sign-in cookies", [
                "The account cookie lets InFlite apps recognise the same signed-in browser. It is secure and inaccessible to page scripts. Its expiry is set to 180 days when issued. Active sessions can renew, up to a maximum of one year. A separate known-device cookie, where used, can last up to one year to help recognise a returning device. You can end a session earlier in Account & security.",
                "InFlite for iPhone stores its sign-in credential in the device Keychain."
            ]),
            ("Preferences, drafts and offline access", [
                "Apps use browser storage to remember settings such as appearance and your last view. Depending on the app, local storage and browser databases can also hold drafts, saved views and changes waiting to sync. A service worker caches app code and assets so they can open again quickly. These items can persist after you close the app, until the app replaces them or you clear its site data."
            ]),
            ("Changing or clearing storage", [
                "On a shared device, sign out when you finish. To remove local copies and preferences, clear the InFlite site data in your browser or installed web app. Save or sync any drafts you need first. Clearing local data can sign you out and discard unsynced changes. Use Your data in Account & security if you also want to delete your account.",
                "You can manage location and notification access separately in your browser or device settings. Questions about storage can go to [privacy@inflite.ai](mailto:privacy@inflite.ai)."
            ])
        ]
    )

    static let terms = Self(
        introduction: "These terms cover the public InFlite website and InFlite apps. InFlite operates the service from the United Kingdom. Contact [hello@inflite.ai](mailto:hello@inflite.ai) if you need help or want to raise a concern.",
        sections: [
            ("Your account and content", ["Keep your sign-in details and recovery methods secure. Review your sessions if you lose a device or suspect someone has used your account. Only upload, send or share material you have the right to use. You keep your rights in your content. Using a feature gives InFlite permission to store, process and deliver your content as needed for that feature."]),
            ("Using InFlite fairly", ["Respect other people’s privacy and choices. Do not use the service to send spam, harass people, distribute unlawful material, interfere with the service or access someone else’s account without permission. We may restrict the affected feature or account where reasonably necessary to address misuse or protect others. You can contact us to ask for a review."]),
            ("Connected services and information", ["When you connect an external service, its own terms may apply to your use of it. Forecasts, market information and fitness estimates can change or contain errors. Check official warnings or seek qualified advice when making safety, financial or health decisions. Keep an independent copy of content you cannot afford to lose."]),
            ("Your choices and legal rights", ["You can stop using InFlite, disconnect an integration or request account deletion through Settings. These terms do not limit your statutory rights, including applicable consumer protections, or exclude any liability that cannot lawfully be excluded."])
        ]
    )
}
