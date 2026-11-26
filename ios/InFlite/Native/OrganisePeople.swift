import SwiftUI

@MainActor
struct NativePeopleView: View {
    let owner: String

    var body: some View {
        PeopleDirectory(service: PeopleService(owner: owner)).id(owner)
    }
}

@MainActor
private struct PeopleDirectory: View {
    let service: PeopleService
    @State private var search = ""
    @State private var displayedSearch: String?
    @State private var records: [PersonRecord] = []
    @State private var cursor: String?
    @State private var request: UUID?
    @State private var loading = false
    @State private var error: String?
    @State private var selection: Selection?

    init(service: PeopleService) { self.service = service }

    var body: some View {
        List {
            if let error, displayedSearch == query {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    Button("Try Again") { Task { await load(query) } }
                }
            }
            if displayedSearch != query || (loading && records.isEmpty) {
                ProgressView("Opening People")
            } else if records.isEmpty && error == nil {
                ContentUnavailableView(
                    query.isEmpty ? "No Contacts Yet" : "No Results",
                    systemImage: "person.2",
                    description: Text(query.isEmpty ? "Add someone to People." : "Try a different name or email address.")
                )
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(records) { person in
                        Button {
                            selection = Selection(personID: person.id)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "person.crop.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(.tint)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(person.title).font(.headline)
                                    if let detail = person.subtitle {
                                        Text(detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Rectangle().fill(.regularMaterial))
                    }
                }
            }
            if let cursor, displayedSearch == query {
                Button("Load More") { Task { await load(query, after: cursor) } }
                    .disabled(loading)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("People")
        .searchable(text: $search, prompt: "Search contacts")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    selection = Selection(personID: nil)
                } label: {
                    Label("New Contact", systemImage: "plus")
                }
            }
        }
        .task(id: query) {
            let requested = query
            if !requested.isEmpty { try? await Task.sleep(for: .milliseconds(250)) }
            await load(requested)
        }
        .refreshable { await load(query) }
        .sheet(item: $selection) { selection in
            NavigationStack {
                PersonProfile(service: service, personID: selection.personID) {
                    Task { await load(query) }
                }
            }
        }
    }

    private var query: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func load(_ query: String, after next: String? = nil) async {
        guard !Task.isCancelled, query == self.query, next == nil || !loading else { return }
        let key = UUID()
        request = key
        if displayedSearch != query {
            records = []
            cursor = nil
        }
        displayedSearch = query
        error = nil
        loading = true
        defer { if request == key { loading = false } }
        guard query.utf16.count <= 160 else {
            error = "Search using 160 characters or fewer."
            return
        }
        do {
            let page = try await service.list(query: query, cursor: next)
            guard request == key, query == self.query, !Task.isCancelled else { return }
            if next == nil {
                records = page.records
            } else {
                let known = Set(records.map(\.id))
                records += page.records.filter { !known.contains($0.id) }
            }
            records.sort { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
            cursor = page.cursor
        } catch {
            if request == key, query == self.query, !Task.isCancelled {
                self.error = error.localizedDescription
            }
        }
    }

    private struct Selection: Identifiable {
        let personID: String?
        let id = UUID()
    }
}

@MainActor
private struct PersonProfile: View {
    let service: PeopleService
    let personID: String?
    let didSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var person: PersonRecord?
    @State private var form: PersonValue?
    @State private var pending: PersonSave?
    @State private var error: String?
    @State private var saving = false
    @State private var newID = OrganiseService.identifier()

    init(service: PeopleService, personID: String?, didSave: @escaping () -> Void) {
        self.service = service
        self.personID = personID
        self.didSave = didSave
        _form = State(initialValue: personID == nil ? PersonValue() : nil)
    }

    var body: some View {
        Form {
            if let form = Binding<PersonValue>($form) {
                editor(form).disabled(saving)
            } else if let person {
                details(person)
            } else if error == nil {
                ProgressView("Opening contact")
            }
            if let error {
                Section {
                    Text(error).foregroundStyle(.secondary)
                    if person == nil, form == nil {
                        Button("Try Again") { Task { await load() } }
                    }
                }
            }
        }
        .navigationTitle(personID == nil ? "New Contact" : form == nil ? "Contact" : "Edit Contact")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(saving)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(form == nil ? "Done" : "Cancel") {
                    if form != nil, person != nil {
                        form = nil
                        pending = nil
                        error = nil
                    } else {
                        dismiss()
                    }
                }
                .disabled(saving)
            }
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView().accessibilityLabel("Saving contact")
                } else if let form {
                    Button("Save") { Task { await save() } }
                        .disabled(form.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else if let person {
                    Button("Edit") {
                        guard let editable = person.editable else {
                            error = "The complete contact couldn’t be loaded."
                            return
                        }
                        form = editable
                    }
                }
            }
        }
        .task { await load() }
    }

    private func editor(_ form: Binding<PersonValue>) -> some View {
        Group {
            Section {
                TextField("Full Name", text: form.title).textContentType(.name)
                TextField("Organisation", text: form.organisation).textContentType(.organizationName)
                TextField("Email", text: form.email).textContentType(.emailAddress)
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never)
                TextField("Phone", text: form.phone).textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
            }
            Section("Contact Notes") {
                TextEditor(text: form.details).frame(minHeight: 110).accessibilityLabel("Contact notes")
            }
        }
    }

    private func details(_ person: PersonRecord) -> some View {
        Group {
            Section {
                Label(person.title, systemImage: "person.crop.circle.fill").font(.title2.weight(.semibold))
                if let organisation = person.organisation, !organisation.isEmpty {
                    Text(organisation)
                }
            }
            if let email = person.email, !email.isEmpty, let url = contactURL("mailto", email) {
                Section("Email") { Link(email, destination: url) }
            }
            if let phone = person.phone, !phone.isEmpty {
                Section("Phone") {
                    if let url = contactURL("tel", phone) {
                        Link(phone, destination: url)
                    } else {
                        Text(phone)
                    }
                }
            }
            if let details = person.details, !details.isEmpty {
                Section("Contact Notes") { Text(details).textSelection(.enabled) }
            }
        }
    }

    private func contactURL(_ scheme: String, _ address: String) -> URL? {
        guard !address.contains(where: \.isNewline) else { return nil }
        var url = URLComponents()
        url.scheme = scheme
        // An email address is a path. URLComponents escapes characters which
        // would otherwise have been interpreted as query or fragment separators.
        url.path = address
        return url.url
    }

    private func load() async {
        guard person == nil, let personID else { return }
        error = nil
        do {
            let record = try await service.read(personID)
            try Task.checkCancellation()
            person = record
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }

    private func save() async {
        guard var value = form, !saving else { return }
        saving = true
        error = nil
        defer { saving = false }
        value.title = value.title.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let operation: PersonSave
            if let pending, pending.value == value {
                operation = pending
            } else {
                operation = try PersonSave(id: person?.id ?? newID, version: person?.version ?? 0, value: value)
                pending = operation
            }
            let saved = try await service.save(operation)
            try Task.checkCancellation()
            person = saved
            form = nil
            pending = nil
            didSave()
            if personID == nil { dismiss() }
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }
}

private struct PersonRecord: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let version: Int
    let email: String?
    let phone: String?
    let organisation: String?
    let details: String?
    let links: [PersonLink]?

    var subtitle: String? {
        [organisation, email, phone].compactMap { $0 }.first { !$0.isEmpty }
    }

    var editable: PersonValue? {
        guard let email, let phone, let organisation, let details, let links else { return nil }
        return PersonValue(title: title, email: email, phone: phone, organisation: organisation, details: details, links: links)
    }
}

private struct PersonLink: Codable, Equatable, Sendable {
    let app: String
    let id: String?
    let item: String?
}

private struct PersonValue: Codable, Equatable, Sendable {
    var title = ""
    var email = ""
    var phone = ""
    var organisation = ""
    var details = ""
    var links: [PersonLink] = []
}

private struct PersonSave: Sendable {
    let value: PersonValue
    let body: Data

    init(id: String, version: Int, value: PersonValue) throws {
        self.value = value
        body = try JSONEncoder().encode(Request(id: id, version: version, value: value))
    }

    private struct Request: Encodable {
        let id: String
        let version: Int
        let value: PersonValue
        let kind = "people"
        let deleted = false
        let operationId = OrganiseService.identifier()
    }
}

private struct PeopleService: Sendable {
    let owner: String

    struct Page: Decodable, Sendable {
        let records: [PersonRecord]
        let cursor: String?
    }

    func list(query: String, cursor: String?) async throws -> Page {
        try await BackendClient.shared.request(
            Page.self, path: "/api/organise/list", method: "POST",
            body: JSONEncoder().encode(ListRequest(q: query, cursor: cursor)), owner: owner
        )
    }

    func read(_ id: String) async throws -> PersonRecord {
        try await BackendClient.shared.request(
            RecordResponse.self, path: "/api/organise/record",
            query: [URLQueryItem(name: "kind", value: "people"), URLQueryItem(name: "id", value: id)],
            owner: owner
        ).record
    }

    func save(_ operation: PersonSave) async throws -> PersonRecord {
        try await BackendClient.shared.request(
            RecordResponse.self, path: "/api/organise/record",
            method: "PUT", body: operation.body, owner: owner
        ).record
    }

    private struct RecordResponse: Decodable, Sendable { let record: PersonRecord }
    private struct ListRequest: Encodable {
        let q: String
        let cursor: String?
        let kind = "people"
    }
}
