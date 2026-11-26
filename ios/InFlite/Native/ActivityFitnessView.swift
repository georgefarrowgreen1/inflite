import SwiftUI

@MainActor
struct ActivityFitnessView: View {
    let owner: String
    var agendaLaunch: TodayAgendaLaunch? = nil

    var body: some View {
        ActivityFitnessScreen(owner: owner, agendaLaunch: agendaLaunch).id(owner)
    }
}

@MainActor
private struct ActivityFitnessScreen: View {
    enum Destination: String, CaseIterable {
        case overview = "Overview"
        case activities = "Activities"
        case routes = "Routes"
    }

    struct Feed {
        let snapshot: ActivityFitnessSnapshot
        let workouts: [ActivityWorkout]
        let more: Bool
    }

    let owner: String
    let agendaLaunch: TodayAgendaLaunch?
    @State private var feed = ActivityResource<Feed>()
    @State private var route = ActivityResource<ActivityFitnessRoute>()
    @State private var destination: Destination = .overview
    @State private var routeEditor: RouteEditor?
    @State private var rideEditor: RideEditor?
    @State private var routeToRemove: RouteRemoval?
    @State private var routeNotice: String?

    private struct RouteEditor: Identifiable {
        let id = UUID()
        let plan: ActivityFitnessRoute.Plan?
    }

    private struct RideEditor: Identifiable {
        let id = UUID()
        let ride: ActivityScheduledRide?
    }

    private struct RouteRemoval {
        let id: String
        let version: String
    }

    var body: some View {
        List {
            if let data = feed.value {
                Picker("Fitness", selection: $destination) {
                    ForEach(Destination.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)

                switch destination {
                case .overview:
                    overviewRows(data)
                case .activities:
                    activityRows(data)
                case .routes:
                    routeRows(unit: data.snapshot.distanceUnit)
                }

                if let issue = feed.issue {
                    ActivityLoadRow(issue: issue, retry: load)
                }
            } else {
                ActivityLoadRow(issue: feed.issue, retry: load)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Fitness")
        .onChange(of: agendaLaunch, initial: true) { _, launch in
            if launch?.destination == .fitnessActivities { destination = .activities }
        }
        .task { await load() }
        .task(id: destination) {
            if destination == .routes, route.value == nil { await loadRoute() }
        }
        .refreshable {
            if destination == .routes { await loadRoute() } else { await load() }
        }
        .sheet(item: $routeEditor) { editor in
            FitnessRouteEditor(owner: owner, unit: feed.value?.snapshot.distanceUnit ?? .kilometers, plan: editor.plan) { saved in
                routeNotice = nil
                await route.load { saved }
            }
        }
        .sheet(item: $rideEditor) { editor in
            FitnessRideEditor(owner: owner, ride: editor.ride, otherRides: feed.value?.snapshot.times ?? [], onChange: load)
        }
        .confirmationDialog("Remove planned ride?", isPresented: Binding(
            get: { routeToRemove != nil }, set: { showing in if !showing { routeToRemove = nil } }
        ), titleVisibility: .visible, presenting: routeToRemove) { target in
            Button("Remove ride", role: .destructive) { Task { await removeRoute(target) } }
        } message: { _ in
            Text("This removes the route and departure from your Fitness plan.")
        }
    }

    @ViewBuilder
    private func overviewRows(_ data: Feed) -> some View {
        let now = Date()
        let since = Calendar.current.date(byAdding: .day, value: -7, to: now) ?? now
        let recent = data.workouts.filter { $0.date >= since && $0.date <= now }
        let distance = recent.compactMap { $0.sum?.dist }.filter { $0 > 0 }.reduce(0, +)
        let duration = recent.compactMap { $0.sum?.duration }.filter { $0 > 0 }.reduce(0, +)
        let upcoming = (data.snapshot.times ?? []).filter { $0.end > now }

        Section("Last 7 days") {
            LabeledContent("Activities", value: recent.count.formatted())
            if duration > 0 {
                LabeledContent("Activity time", value: activityDuration(duration))
            }
            if distance > 0 {
                LabeledContent("Distance", value: activityDistance(distance, unit: data.snapshot.distanceUnit))
            }
        }
        Section("Upcoming rides") {
            ForEach(upcoming) { ride in
                Button { rideEditor = RideEditor(ride: ride) } label: {
                    Label {
                        Text(ride.date, format: .dateTime.weekday(.wide).month(.abbreviated).day().hour().minute())
                            .foregroundStyle(.primary)
                    } icon: {
                        Image(systemName: "calendar")
                            .foregroundStyle(.orange)
                    }
                }
            }
            Button { rideEditor = RideEditor(ride: nil) } label: {
                Label("Schedule a ride", systemImage: "plus")
            }
        }
        if let plan = data.snapshot.data?.plan {
            Section("Training plan") {
                LabeledContent(plan.name, value: plan.date.formatted(.dateTime.month(.abbreviated).day()))
            }
        }
        if let threshold = data.snapshot.data?.profile?.ftp {
            Section("Training numbers") {
                LabeledContent("Functional threshold power", value: "\(threshold.formatted()) W")
            }
        }
        Section("Latest activity") {
            if let latest = data.workouts.first {
                workoutLink(latest, unit: data.snapshot.distanceUnit)
            } else {
                Text("No activities yet").foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func activityRows(_ data: Feed) -> some View {
        Section("Activity history") {
            if data.workouts.isEmpty {
                Text("No activities yet").foregroundStyle(.secondary)
            }
            ForEach(data.workouts) { activity in
                workoutLink(activity, unit: data.snapshot.distanceUnit)
            }
            if data.more {
                Button("Load older activities") { Task { await loadOlder() } }
                    .disabled(feed.loading)
            }
        }
    }

    private func workoutLink(_ activity: ActivityWorkout, unit: UnitLength) -> some View {
        NavigationLink {
            ActivityWorkoutDetail(activity: activity, unit: unit)
        } label: {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(activity.name).font(.body.weight(.semibold))
                    Text(activity.date, format: .dateTime.month(.abbreviated).day().year())
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: activity.symbol).foregroundStyle(.orange)
            }
            .padding(.vertical, 3)
        }
    }

    @ViewBuilder
    private func routeRows(unit: UnitLength) -> some View {
        if let saved = route.value {
            Section("Planned ride") {
                if let plan = saved.plan {
                    if let date = plan.departure {
                        Text(date, format: .dateTime.weekday(.wide).month(.abbreviated).day().hour().minute())
                            .foregroundStyle(.secondary)
                    }
                    FitnessRouteSummary(route: plan.route, unit: unit)
                    Button { routeEditor = RouteEditor(plan: plan) } label: {
                        Label("Edit ride", systemImage: "pencil")
                    }
                    .disabled(route.loading)
                    if let version = plan.version {
                        Button("Remove planned ride", role: .destructive) {
                            routeToRemove = RouteRemoval(id: plan.route.id, version: version)
                        }
                        .disabled(route.loading)
                    }
                } else {
                    Text("No route planned").foregroundStyle(.secondary)
                    Button { routeEditor = RouteEditor(plan: nil) } label: {
                        Label("Plan a ride", systemImage: "plus")
                    }
                    .disabled(route.loading)
                }
                if let routeNotice { Text(routeNotice).foregroundStyle(.secondary) }
            }
            if let issue = route.issue { ActivityLoadRow(issue: issue, retry: loadRoute) }
        } else {
            ActivityLoadRow(issue: route.issue, retry: loadRoute)
        }
    }

    private func load() async {
        await feed.load {
            let response = try await BackendClient.shared.request(
                ActivityFitnessSnapshot.self, path: "/api/fitness/me",
                query: [URLQueryItem(name: "today", value: "1"),
                        URLQueryItem(name: "tz", value: TimeZone.current.identifier)], owner: owner
            )
            let snapshot = try response.validated(for: owner)
            return Feed(snapshot: snapshot, workouts: snapshot.acts ?? [], more: snapshot.more == true)
        }
    }

    private func loadOlder() async {
        guard let current = feed.value, current.more,
              let last = current.workouts.last else { return }
        await feed.load {
            let response = try await BackendClient.shared.request(
                ActivityFitnessPage.self, path: "/api/fitness/me/older",
                query: [URLQueryItem(name: "start", value: String(last.start)),
                        URLQueryItem(name: "id", value: last.id)], owner: owner
            )
            var seen = Set(current.workouts.map(\.id))
            let additional = response.acts.filter { seen.insert($0.id).inserted }
            return Feed(snapshot: current.snapshot, workouts: current.workouts + additional,
                        more: response.more == true && !additional.isEmpty)
        }
    }

    private func loadRoute() async {
        guard !route.loading else { return }
        await route.load {
            try await BackendClient.shared.request(
                ActivityFitnessRoute.self, path: "/api/fitness/routes/plan", owner: owner
            )
        }
    }

    private func removeRoute(_ target: RouteRemoval) async {
        guard !route.loading else { return }
        routeNotice = nil
        await route.load {
            let body = try JSONEncoder().encode(["id": target.id, "version": target.version])
            return try await BackendClient.shared.request(
                ActivityFitnessRoute.self, path: "/api/fitness/routes/plan", method: "DELETE", body: body, owner: owner
            )
        }
        if route.issue == nil, route.value?.plan != nil {
            routeNotice = "A newer route is saved. Review it before removing."
        }
    }
}

private struct ActivityWorkoutDetail: View {
    let activity: ActivityWorkout
    let unit: UnitLength

    var body: some View {
        List {
            Section {
                Label(activity.category, systemImage: activity.symbol)
                LabeledContent("Date", value: activity.date.formatted(.dateTime.month(.abbreviated).day().year().hour().minute()))
                if let device = activity.device { LabeledContent("Recorded with", value: device) }
            }
            if let summary = activity.sum {
                Section("Summary") {
                    if let duration = summary.duration, duration > 0 {
                        LabeledContent("Time", value: activityDuration(duration))
                    }
                    if let distance = summary.dist, distance > 0 {
                        LabeledContent("Distance", value: activityDistance(distance, unit: unit))
                    }
                    if let ascent = summary.ascent, ascent > 0 {
                        LabeledContent("Climbing", value: activityElevation(ascent, unit: unit))
                    }
                    if let power = summary.avgPwr, power > 0 {
                        LabeledContent("Average power", value: "\(power.formatted(.number.precision(.fractionLength(0)))) W")
                    }
                    if let heartRate = summary.avgHr, heartRate > 0 {
                        LabeledContent("Average heart rate", value: "\(heartRate.formatted(.number.precision(.fractionLength(0)))) bpm")
                    }
                    if let energy = summary.kcal, energy > 0 {
                        LabeledContent("Energy", value: "\(energy.formatted(.number.precision(.fractionLength(0)))) kcal")
                    }
                }
                if let outline = summary.route, outline.count >= 4, outline.count.isMultiple(of: 2) {
                    let points = stride(from: 0, to: outline.count, by: 2).map {
                        CGPoint(x: outline[$0], y: outline[$0 + 1])
                    }
                    Section("Route") { ActivityRoutePreview(points: points) }
                }
            } else {
                Text("No metrics recorded").foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(activity.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ActivityRoutePreview: View {
    let points: [CGPoint]

    var body: some View {
        if points.count > 1 {
            Canvas { context, size in
                let minX = points.map(\.x).min() ?? 0
                let minY = points.map(\.y).min() ?? 0
                let width = (points.map(\.x).max() ?? minX) - minX
                let height = (points.map(\.y).max() ?? minY) - minY
                let scale = min((size.width - 18) / max(width, 1e-9), (size.height - 18) / max(height, 1e-9))
                guard scale > 0 else { return }
                let x = (size.width - width * scale) / 2
                let y = (size.height - height * scale) / 2
                let line = Path { path in
                    let step = max(1, points.count / 1024)
                    for index in stride(from: 0, to: points.count, by: step) {
                        let p = points[index]
                        let position = CGPoint(x: x + (p.x - minX) * scale, y: y + (p.y - minY) * scale)
                        if index == 0 { path.move(to: position) } else { path.addLine(to: position) }
                    }
                    if let last = points.last {
                        path.addLine(to: CGPoint(x: x + (last.x - minX) * scale, y: y + (last.y - minY) * scale))
                    }
                }
                context.stroke(line, with: .color(.orange), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }
            .frame(height: 144)
            .background(Color.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 16))
            .accessibilityLabel("Route outline")
        }
    }
}

func activityDistance(_ metres: Double, unit: UnitLength) -> String {
    let distance = Measurement(value: metres, unit: UnitLength.meters).converted(to: unit)
    return "\(distance.value.formatted(.number.precision(.fractionLength(0...1)))) \(unit == .miles ? "mi" : "km")"
}

func activityElevation(_ metres: Double, unit: UnitLength) -> String {
    let elevationUnit: UnitLength = unit == .miles ? .feet : .meters
    let elevation = Measurement(value: metres, unit: UnitLength.meters).converted(to: elevationUnit)
    return "\(elevation.value.formatted(.number.precision(.fractionLength(0)))) \(elevationUnit == .feet ? "ft" : "m")"
}

private func activityDuration(_ seconds: Double) -> String {
    Duration.seconds(seconds).formatted(.units(allowed: [.hours, .minutes, .seconds], width: .abbreviated))
}
