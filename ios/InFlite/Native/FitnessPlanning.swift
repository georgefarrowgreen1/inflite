import MapKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct FitnessRouteEditor: View {
    private enum Surface: String, CaseIterable, Identifiable {
        case road, gravel, mtb

        var id: String { rawValue }
        var title: String { self == .mtb ? "Mountain bike" : rawValue.capitalized }
    }

    private struct RouteQuery: Encodable {
        let start: [Double]
        let metres: Int
        let surface: String
        let seed: Int
        let roadPreference: String
        let avoidUnpaved: Bool
    }

    private struct RouteChoices: Decodable {
        let routes: [ActivityFitnessRoute.Route]
    }

    private struct SaveRoute: Encodable {
        let route: ActivityFitnessRoute.Route
        let day: String
        let time: String
        let tz: String
    }

    private enum Operation: Equatable { case places, routes, importFile, save }

    let owner: String
    let unit: UnitLength
    let plan: ActivityFitnessRoute.Plan?
    let onSave: (ActivityFitnessRoute) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var route: ActivityFitnessRoute.Route?
    @State private var departure: Date
    @State private var surface: Surface
    @State private var distance: String
    @State private var quietRoads: Bool
    @State private var avoidUnpaved: Bool
    @State private var placeQuery = ""
    @State private var places: [MKMapItem] = []
    @State private var start: MKMapItem?
    @State private var choices: [ActivityFitnessRoute.Route] = []
    @State private var operation: Operation?
    @State private var work: Task<Void, Never>?
    @State private var search: MKLocalSearch?
    @State private var issue: String?
    @State private var showImport = false

    init(owner: String, unit: UnitLength, plan: ActivityFitnessRoute.Plan?, onSave: @escaping (ActivityFitnessRoute) async -> Void) {
        self.owner = owner
        self.unit = unit
        self.plan = plan
        self.onSave = onSave
        let route = plan?.route
        let calendar = fitnessCalendar(zone: plan.flatMap { TimeZone(identifier: $0.tz) } ?? .current)
        let range = departureRange(calendar: calendar)
        _route = State(initialValue: route)
        _departure = State(initialValue: min(max(plan?.departure ?? .now.addingTimeInterval(3600), range.lowerBound), range.upperBound))
        _surface = State(initialValue: route.flatMap { Surface(rawValue: $0.surface) } ?? .road)
        let metres = route?.targetMetres ?? 30_000
        _distance = State(initialValue: Measurement(value: Double(metres), unit: UnitLength.meters)
            .converted(to: unit).value.formatted(.number.precision(.fractionLength(0...1))))
        _quietRoads = State(initialValue: route?.roadPreference == "quiet")
        _avoidUnpaved = State(initialValue: route?.avoidUnpaved ?? true)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let operation { progress(operation) }
                if let route {
                    Section("Selected route") { FitnessRouteSummary(route: route, unit: unit) }
                }
                startSection
                Section("Route preferences") {
                    TextField(unit == .miles ? "Distance in miles" : "Distance in kilometres", text: $distance)
                        .keyboardType(.decimalPad)
                    Picker("Surface", selection: $surface) {
                        ForEach(Surface.allCases) { surface in Text(surface.title).tag(surface) }
                    }
                    if surface == .road {
                        Toggle("Prefer quieter roads", isOn: $quietRoads)
                        Toggle("Avoid unpaved roads", isOn: $avoidUnpaved)
                    }
                    Button("Find cycling loops", action: findRoutes)
                        .disabled(startCoordinate == nil || targetMetres == nil)
                    Button("Import GPX route", systemImage: "square.and.arrow.down") { showImport = true }
                }
                .disabled(operation != nil)
                if !choices.isEmpty {
                    Section("Cycling loops") {
                        ForEach(choices) { candidate in
                            Button {
                                route = candidate
                                issue = nil
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(candidate.name).foregroundStyle(.primary)
                                        Text(activityDistance(candidate.metres, unit: unit))
                                            .font(.footnote).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if candidate.id == route?.id {
                                        Image(systemName: "checkmark.circle.fill").accessibilityHidden(true)
                                    }
                                }
                            }
                            .accessibilityAddTraits(candidate.id == route?.id ? .isSelected : [])
                        }
                    }
                    .disabled(operation != nil)
                }
                Section {
                    DatePicker("Departure", selection: $departure, in: departureRange(calendar: calendar))
                } footer: {
                    Text("Times use \(calendar.timeZone.identifier.replacingOccurrences(of: "_", with: " ")).")
                }
                .disabled(operation == .save)
                if let issue {
                    Section { Text(issue).foregroundStyle(.secondary) }
                }
            }
            .environment(\.timeZone, calendar.timeZone)
            .onChange(of: distance) { choices = [] }
            .onChange(of: surface) { choices = [] }
            .onChange(of: quietRoads) { choices = [] }
            .onChange(of: avoidUnpaved) { choices = [] }
            .navigationTitle(plan == nil ? "Plan a ride" : "Edit planned ride")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(operation == .save)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(route == nil || operation != nil)
                }
            }
            .fileImporter(isPresented: $showImport, allowedContentTypes: [.fitnessGPX]) { result in
                importRoute(result)
            }
        }
        .interactiveDismissDisabled(operation == .save)
        .onDisappear { work?.cancel(); search?.cancel() }
    }

    private var startSection: some View {
        Section {
            TextField("Town, address or postcode", text: $placeQuery)
                .submitLabel(.search)
                .onSubmit(findPlaces)
                .onChange(of: placeQuery) { _, _ in
                    start = nil
                    places = []
                    choices = []
                }
            Button("Search for a start", action: findPlaces).disabled(cleanQuery.isEmpty)
            ForEach(places.indices, id: \.self) { index in
                let item = places[index]
                Button {
                    start = item
                    choices = []
                    issue = nil
                } label: {
                    HStack {
                        Text(item.placemark.title ?? item.name ?? "Starting point").foregroundStyle(.primary)
                        Spacer()
                        if start === item { Image(systemName: "checkmark").accessibilityHidden(true) }
                    }
                }
                .accessibilityAddTraits(start === item ? .isSelected : [])
            }
        } header: {
            Text("Starting point")
        } footer: {
            Text("Cycling loops cover the United Kingdom. Choose 5–120 km or the equivalent in miles.")
        }
        .disabled(operation != nil)
    }

    private func progress(_ operation: Operation) -> some View {
        let title: String = switch operation {
        case .places: "Searching for places"
        case .routes: "Finding cycling loops"
        case .importFile: "Reading GPX route"
        case .save: "Saving planned ride"
        }
        return Section {
            ProgressView(title)
            if operation != .save {
                Button("Cancel request") {
                    work?.cancel()
                    search?.cancel()
                }
            }
        }
    }

    private var calendar: Calendar {
        fitnessCalendar(zone: plan.flatMap { TimeZone(identifier: $0.tz) } ?? .current)
    }

    private var cleanQuery: String { placeQuery.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var targetMetres: Int? {
        guard let value = try? Double(distance, format: .number) else { return nil }
        let metres = Measurement(value: value, unit: unit).converted(to: .meters).value.rounded()
        guard (5_000...120_000).contains(metres) else { return nil }
        return Int(metres)
    }

    private var startCoordinate: CLLocationCoordinate2D? {
        guard let point = start?.placemark.coordinate, CLLocationCoordinate2DIsValid(point), abs(point.latitude) < 85 else { return nil }
        return point
    }

    private func findPlaces() {
        let query = cleanQuery
        guard !query.isEmpty, operation == nil else { return }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 54.4, longitude: -3.5),
                                            span: MKCoordinateSpan(latitudeDelta: 11, longitudeDelta: 12))
        let search = MKLocalSearch(request: request)
        self.search = search
        run(.places) {
            defer { self.search = nil }
            let response = try await search.start()
            try Task.checkCancellation()
            places = Array(response.mapItems.filter { $0.placemark.isoCountryCode == "GB" }.prefix(5))
            if places.isEmpty { issue = "No UK starting points found. Try a town or postcode." }
        }
    }

    private func findRoutes() {
        guard let point = startCoordinate, let metres = targetMetres else { return }
        let query = RouteQuery(start: [point.longitude, point.latitude], metres: metres, surface: surface.rawValue,
                               seed: Int.random(in: 0...1_000_000), roadPreference: quietRoads ? "quiet" : "main",
                               avoidUnpaved: surface == .road && avoidUnpaved)
        run(.routes) {
            choices = []
            let response = try await BackendClient.shared.request(
                RouteChoices.self, path: "/api/fitness/routes/generate", method: "POST",
                body: JSONEncoder().encode(query), owner: owner
            )
            try Task.checkCancellation()
            choices = Array(response.routes.prefix(3))
            if choices.isEmpty { issue = "No suitable loops found. Try a different start or distance." }
            if route == nil { route = choices.first }
        }
    }

    private func importRoute(_ result: Result<URL, Error>) {
        run(.importFile) {
            let url = try result.get()
            let imported = try await Task.detached(priority: .userInitiated) { try FitnessGPX.read(url) }.value
            try Task.checkCancellation()
            route = imported
            choices = []
        }
    }

    private func save() {
        guard let route else { return }
        let payload = SaveRoute(route: route, day: fitnessDate(departure, style: "yyyy-MM-dd", zone: calendar.timeZone),
                                time: fitnessDate(departure, style: "HH:mm", zone: calendar.timeZone), tz: calendar.timeZone.identifier)
        run(.save) {
            let saved = try await BackendClient.shared.request(
                ActivityFitnessRoute.self, path: "/api/fitness/routes/plan", method: "PUT",
                body: JSONEncoder().encode(payload), owner: owner
            )
            guard saved.plan != nil else { throw BackendError.invalidResponse }
            try Task.checkCancellation()
            await onSave(saved)
            dismiss()
        }
    }

    private func run(_ next: Operation, _ action: @escaping @MainActor () async throws -> Void) {
        guard operation == nil else { return }
        issue = nil
        operation = next
        work = Task {
            defer { operation = nil; work = nil }
            do { try await action() }
            catch { if !Task.isCancelled { issue = error.localizedDescription } }
        }
    }
}

@MainActor
struct FitnessRideEditor: View {
    private struct RideTime: Encodable {
        let day: String
        let start: Int64
        let stop: Int64
        let tz: String
    }

    private struct Scheduled: Decodable { let time: ActivityScheduledRide }
    private struct Removed: Decodable { let ok: Bool }

    let owner: String
    let ride: ActivityScheduledRide?
    let otherRides: [ActivityScheduledRide]
    let onChange: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var departure: Date
    @State private var minutes: Int
    @State private var busy = false
    @State private var confirmRemoval = false
    @State private var issue: String?
    @State private var work: Task<Void, Never>?

    init(owner: String, ride: ActivityScheduledRide?, otherRides: [ActivityScheduledRide], onChange: @escaping () async -> Void) {
        self.owner = owner
        self.ride = ride
        self.otherRides = otherRides
        self.onChange = onChange
        let now = Date.now.timeIntervalSince1970
        _departure = State(initialValue: ride?.date ?? Date(timeIntervalSince1970: ceil(now / 300) * 300))
        let duration = ride.map { ($0.stop - $0.start) / 60_000 } ?? 60
        _minutes = State(initialValue: Int(min(360, max(15, duration))))
    }

    var body: some View {
        NavigationStack {
            Form {
                if busy { ProgressView("Updating scheduled ride") }
                Section {
                    if let ride {
                        LabeledContent("Day", value: ride.date.formatted(.dateTime.weekday(.wide).month().day()))
                        DatePicker("Start time", selection: $departure, displayedComponents: .hourAndMinute)
                    } else {
                        DatePicker("Start time", selection: $departure, in: nextWeek)
                    }
                    Stepper(value: $minutes, in: 15...360, step: 5) {
                        LabeledContent("Duration", value: Duration.seconds(minutes * 60).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated)))
                    }
                } footer: {
                    Text("Rides start on five-minute intervals in your device’s time zone.")
                }
                .disabled(busy)
                if let issue { Section { Text(issue).foregroundStyle(.secondary) } }
                if ride != nil {
                    Section {
                        Button("Remove scheduled ride", role: .destructive) { confirmRemoval = true }
                            .disabled(busy)
                    }
                }
            }
            .onChange(of: departure) { _, value in
                let rounded = roundedDeparture(value)
                if rounded != value { departure = rounded }
            }
            .navigationTitle(ride == nil ? "Schedule a ride" : "Edit scheduled ride")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(busy)
                }
            }
            .confirmationDialog("Remove scheduled ride?", isPresented: $confirmRemoval, titleVisibility: .visible) {
                Button("Remove ride", role: .destructive, action: remove)
            }
        }
        .interactiveDismissDisabled(busy)
        .onDisappear { work?.cancel() }
    }

    private var nextWeek: ClosedRange<Date> {
        let first = Calendar.current.startOfDay(for: .now)
        let last = Calendar.current.date(byAdding: .day, value: 8, to: first) ?? first
        return first...max(first, last.addingTimeInterval(-1))
    }

    private func save() {
        let instant = roundedDeparture(departure)
        let end = instant.addingTimeInterval(Double(minutes * 60))
        let day = fitnessDate(instant, style: "yyyy-MM-dd", zone: .current)
        guard end > .now else { issue = "Choose a ride that hasn’t ended."; return }
        if let ride, ride.day != day {
            issue = "This ride was saved in another time zone. Schedule a new ride to use your current time zone."
            return
        }
        if ride == nil, otherRides.contains(where: { $0.day == day && $0.end > .now }) {
            issue = "There’s already a ride on this day. Edit it from Upcoming rides."
            return
        }
        let payload = RideTime(day: day, start: Int64(instant.timeIntervalSince1970 * 1_000),
                               stop: Int64(end.timeIntervalSince1970 * 1_000), tz: TimeZone.current.identifier)
        run {
            let result = try await BackendClient.shared.request(
                Scheduled.self, path: "/api/fitness/time", method: "PUT", body: JSONEncoder().encode(payload), owner: owner
            )
            guard result.time.day == day else { throw BackendError.invalidResponse }
        }
    }

    private func roundedDeparture(_ value: Date) -> Date {
        Date(timeIntervalSince1970: floor(value.timeIntervalSince1970 / 300) * 300)
    }

    private func remove() {
        guard let ride else { return }
        run {
            let result = try await BackendClient.shared.request(
                Removed.self, path: "/api/fitness/time", method: "DELETE",
                body: JSONEncoder().encode(["day": ride.day]), owner: owner
            )
            guard result.ok else { throw BackendError.invalidResponse }
        }
    }

    private func run(_ action: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true
        issue = nil
        work = Task {
            defer { busy = false; work = nil }
            do {
                try await action()
                try Task.checkCancellation()
                await onChange()
                dismiss()
            } catch {
                if !Task.isCancelled { issue = error.localizedDescription }
            }
        }
    }
}

struct FitnessRouteSummary: View {
    let route: ActivityFitnessRoute.Route
    let unit: UnitLength
    @State private var showExport = false
    @State private var exportDocument: FitnessGPX?
    @State private var error: String?

    var body: some View {
        let points = mapPoints
        Text(route.name).font(.headline)
        LabeledContent("Distance", value: activityDistance(route.metres, unit: unit))
        if let ascent = route.ascent { LabeledContent("Climbing", value: activityElevation(ascent, unit: unit)) }
        LabeledContent("Surface", value: route.surfaceName)
        if points.count > 1 {
            let first = points[0]
            let scale = cos(first.latitude * .pi / 180)
            ActivityRoutePreview(points: points.map {
                let longitude = ($0.longitude - first.longitude + 540).truncatingRemainder(dividingBy: 360) - 180
                return CGPoint(x: longitude * scale, y: -$0.latitude)
            })
            NavigationLink("View route map") {
                FitnessRouteMap(coordinates: points, name: route.name)
            }
            Button("Export GPX", systemImage: "square.and.arrow.up") {
                exportDocument = FitnessGPX(route: route)
                showExport = true
            }
                .fileExporter(isPresented: $showExport, document: exportDocument,
                              contentType: .fitnessGPX, defaultFilename: route.name) { result in
                    if case .failure(let failure) = result { error = failure.localizedDescription }
                }
        }
        if let provider = route.provider { Text(provider).font(.footnote).foregroundStyle(.secondary) }
        if let error { Text(error).foregroundStyle(.secondary) }
    }

    private var mapPoints: [CLLocationCoordinate2D] {
        route.coords.compactMap { point in
            guard point.count >= 2, let longitude = point[0], let latitude = point[1],
                  abs(longitude) <= 180, abs(latitude) < 85 else { return nil }
            return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
    }
}

private struct FitnessRouteMap: View {
    let coordinates: [CLLocationCoordinate2D]
    let name: String

    var body: some View {
        Map {
            MapPolyline(coordinates: coordinates).stroke(.orange, lineWidth: 4)
            if let first = coordinates.first { Marker("Start", coordinate: first).tint(.orange) }
        }
        .mapControls { MapCompass(); MapScaleView() }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private func fitnessCalendar(zone: TimeZone) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return calendar
}

private func departureRange(calendar: Calendar) -> ClosedRange<Date> {
    let first = calendar.startOfDay(for: .now)
    let last = calendar.date(byAdding: .day, value: 31, to: first) ?? first
    return first...max(first, last.addingTimeInterval(-60))
}

private func fitnessDate(_ date: Date, style: String, zone: TimeZone) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = fitnessCalendar(zone: zone)
    formatter.timeZone = zone
    formatter.dateFormat = style
    return formatter.string(from: date)
}

private extension UTType {
    static let fitnessGPX = UTType(filenameExtension: "gpx", conformingTo: .xml) ?? .xml
}

private struct FitnessGPX: FileDocument {
    static var readableContentTypes: [UTType] { [.fitnessGPX] }
    private let bytes: Data

    init(route: ActivityFitnessRoute.Route) {
        let title = route.name.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let points = route.coords.compactMap { point -> String? in
            guard point.count >= 2, let longitude = point[0], let latitude = point[1] else { return nil }
            let elevation = point.count > 2 ? point[2].map { "<ele>\($0)</ele>" } ?? "" : ""
            return "<trkpt lat=\"\(latitude)\" lon=\"\(longitude)\">\(elevation)</trkpt>"
        }
        let metadata = route.source == "imported-gpx" ? "Imported GPX route" : "BRouter and OpenStreetMap contributors (ODbL)"
        bytes = Data("""
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1" creator="InFlite Fitness" xmlns="http://www.topografix.com/GPX/1/1">
            <metadata><name>\(title)</name><desc>\(metadata)</desc></metadata>
            <trk><name>\(title)</name><trkseg>\(points.joined())</trkseg></trk></gpx>
            """.utf8)
    }

    init(configuration: ReadConfiguration) throws {
        guard let bytes = configuration.file.regularFileContents else { throw GPXError.invalidFile }
        self.bytes = bytes
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: bytes)
    }

    static func read(_ url: URL) throws -> ActivityFitnessRoute.Route {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let limit = 5 * 1024 * 1024
        guard let bytes = try handle.read(upToCount: limit + 1), bytes.count <= limit,
              !bytes.contains(0), let text = String(data: bytes, encoding: .utf8),
              text.range(of: "<!DOCTYPE", options: .caseInsensitive) == nil,
              text.range(of: "<!ENTITY", options: .caseInsensitive) == nil else {
            throw GPXError.invalidFile
        }
        let reader = GPXRouteReader()
        let parser = XMLParser(data: bytes)
        parser.shouldProcessNamespaces = true
        parser.shouldResolveExternalEntities = false
        parser.delegate = reader
        let parsed = parser.parse()
        if let error = reader.error { throw error }
        guard parsed, reader.groups == 1, reader.points.count >= 2 else { throw GPXError.invalidFile }

        var total = 0.0
        var ascent = 0.0
        var anchor = reader.points[0].elevation
        let elevations = reader.points.allSatisfy { $0.elevation != nil }
        for (previous, next) in zip(reader.points, reader.points.dropFirst()) {
            let segment = previous.distance(to: next)
            guard segment <= 2_500 else { throw GPXError.invalidGeometry }
            total += segment
            if let elevation = next.elevation, let from = anchor, abs(elevation - from) >= 3 {
                ascent += max(0, elevation - from)
                anchor = elevation
            }
        }
        guard (100...500_000).contains(total.rounded()) else { throw GPXError.invalidGeometry }

        let rawName = reader.name.isEmpty ? url.deletingPathExtension().lastPathComponent : reader.name
        let bidi = CharacterSet(charactersIn: "\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}")
        let unwanted = CharacterSet.controlCharacters.union(bidi)
        let filtered = rawName.unicodeScalars.filter { !unwanted.contains($0) }
        let trimmed = String(String.UnicodeScalarView(filtered)).trimmingCharacters(in: .whitespacesAndNewlines)
        let name = String(trimmed.prefix(45))
        let start = reader.points[0]
        return ActivityFitnessRoute.Route(
            id: "r-\(UUID().uuidString.lowercased())", name: name.isEmpty ? "Imported route" : name,
            surface: "mixed", metres: total.rounded(), ascent: elevations ? ascent.rounded() : nil,
            coords: reader.points.map { [$0.longitude, $0.latitude, $0.elevation] }, start: [start.longitude, start.latitude],
            provider: "Imported GPX", source: "imported-gpx", targetMetres: nil, roadPreference: nil, avoidUnpaved: nil,
            longestTerrainMetres: nil, terrain: nil, generatedAt: floor(Date.now.timeIntervalSince1970 * 1_000)
        )
    }
}

private enum GPXError: LocalizedError {
    case invalidFile, invalidGeometry, recordedActivity

    var errorDescription: String? {
        switch self {
        case .invalidFile: "Choose one continuous GPX route or track, under 5 MB and with 2–12,000 points."
        case .invalidGeometry: "The route needs valid coordinates, a distance of 100 m to 500 km, and no gaps over 2.5 km."
        case .recordedActivity: "This GPX file contains a recorded activity. Choose a route with no recorded timestamps."
        }
    }
}

private final class GPXRouteReader: NSObject, XMLParserDelegate {
    struct Point {
        let longitude: Double
        let latitude: Double
        var elevation: Double?

        func distance(to next: Point) -> Double {
            let radians = Double.pi / 180
            let dy = (next.latitude - latitude) * radians
            let dx = (next.longitude - longitude) * radians
            let a = pow(sin(dy / 2), 2) + cos(latitude * radians) * cos(next.latitude * radians) * pow(sin(dx / 2), 2)
            return 12_742_000 * atan2(sqrt(a), sqrt(max(0, 1 - a)))
        }
    }

    private(set) var points: [Point] = []
    private(set) var error: GPXError?
    private(set) var groups = 0
    private(set) var name = ""
    private var point: Point?
    private var path: [String] = []
    private var characters = ""

    private var isPoint: Bool {
        path == ["gpx", "rte", "rtept"] || path == ["gpx", "trk", "trkseg", "trkpt"]
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String]) {
        path.append(elementName)
        characters = ""
        guard path.count <= 32, path.first == "gpx" else { fail(parser, .invalidFile); return }
        if path == ["gpx", "rte"] || path == ["gpx", "trk", "trkseg"] {
            groups += 1
            guard groups == 1 else { fail(parser, .invalidFile); return }
        }
        if isPoint {
            guard points.count < 12_000 else { fail(parser, .invalidFile); return }
            guard let latitude = attributeDict["lat"].flatMap(Double.init), abs(latitude) < 85,
                  let longitude = attributeDict["lon"].flatMap(Double.init), abs(longitude) <= 180 else {
                fail(parser, .invalidGeometry)
                return
            }
            point = Point(longitude: longitude, latitude: latitude)
        } else if point != nil && elementName == "time" {
            fail(parser, .recordedActivity)
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if path.last == "name" || path.last == "ele", characters.count < 300 {
            characters += String(string.prefix(300))
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if isPoint, let point {
            points.append(point)
            self.point = nil
        } else if elementName == "ele", point != nil {
            let text = characters.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                guard let elevation = Double(text), (-500...10_000).contains(elevation) else {
                    fail(parser, .invalidGeometry)
                    return
                }
                point?.elevation = elevation
            }
        } else if path == ["gpx", "rte", "name"] || path == ["gpx", "trk", "name"] || name.isEmpty && path == ["gpx", "metadata", "name"] {
            name = characters.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        path.removeLast()
        characters = ""
    }

    private func fail(_ parser: XMLParser, _ issue: GPXError) {
        error = issue
        parser.abortParsing()
    }
}
