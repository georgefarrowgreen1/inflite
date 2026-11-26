import SwiftUI

struct NativeTodayView: View {
    let user: BackendUser
    let initialToday: BackendToday?
    let preview: Bool
    let open: (InFliteRoute) -> Void
    let capture: () -> Void
    let onSessionExpired: () -> Void

    @State private var today: BackendToday?
    @State private var loading = false
    @State private var failed = false

    private var day: BackendToday? { today ?? initialToday }
    private var summary: BackendTodayTop? {
        guard let day else { return nil }
        return day.phase.flatMap { day.tops?[$0] } ?? day.tops?["morning"]
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 17) {
                header

                if let summary, let title = summary.title, !title.isEmpty {
                    summaryCard(summary, title: title)
                } else if preview {
                    NativeCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Your day, joined up").font(.title2.bold())
                            Text("A look at your plans and updates for today.").foregroundStyle(.secondary)
                        }
                    }
                }
                if let weather = day?.cards?.weather, let now = weather.now {
                    weatherCard(weather, now: now)
                }
                if let events = day?.upcoming, !events.isEmpty {
                    agenda("Coming up", events: events)
                }
                if let events = day?.waiting, !events.isEmpty {
                    agenda("Waiting", events: events)
                }
                if failed {
                    NativeCard {
                        VStack(alignment: .leading, spacing: 9) {
                            Label("Today couldn’t refresh", systemImage: "arrow.clockwise")
                            Button("Try again") { Task { await refresh() } }.buttonStyle(.bordered)
                        }
                    }
                } else if day == nil && !preview {
                    if loading {
                        ProgressView("Loading Today").padding(.vertical, 28)
                    } else {
                        Text("Today is up to date.").foregroundStyle(.secondary).padding(.vertical, 26)
                    }
                }
            }
            .frame(maxWidth: 590)
            .padding(.horizontal, 16)
            .padding(.top, 7)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await refresh() }
        .task {
            if day == nil, !preview { await refresh() }
        }
    }

    private var header: some View {
        HStack(spacing: 9) {
            Image("InFliteMark").resizable().scaledToFit()
                .frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 11))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Today").font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("native-today")
                Text(Date.now, format: .dateTime.weekday(.wide).day().month(.wide))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            Button(action: capture) {
                Image(systemName: "plus").font(.headline)
                    .frame(width: 45, height: 45)
                    .background(.regularMaterial, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quick Capture")
            Button {
                open(.account)
            } label: {
                Text(String(user.name.prefix(1)).uppercased())
                    .font(.headline)
                    .frame(width: 45, height: 45)
                    .background(NativeStyle.accent.opacity(0.20), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Account settings")
        }
        .padding(.bottom, 8)
    }

    private func summaryCard(_ summary: BackendTodayTop, title: String) -> some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 15) {
                if let chip = summary.chip, !chip.isEmpty {
                    Text(chip).font(.caption.weight(.semibold))
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(.primary.opacity(0.08), in: .capsule)
                }
                Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                if let stats = summary.stats, !stats.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 19) {
                            ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(stat.label ?? "").font(.caption).foregroundStyle(.secondary)
                                    Text(stat.value ?? "").font(.headline)
                                }
                            }
                        }
                        .padding(12)
                    }
                    .scrollIndicators(.hidden)
                    .background(.primary.opacity(0.05), in: .rect(cornerRadius: 14))
                }
                ForEach(Array((summary.lines ?? []).enumerated()), id: \.offset) { _, line in
                    Text(line).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func weatherCard(_ weather: BackendWeatherCard, now: BackendWeatherNow) -> some View {
        Button { open(.weather) } label: {
            NativeCard {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        NativeAppIcon(route: .weather, size: 28)
                        Text("Weather").font(.headline)
                        if let place = weather.place?.name { Text(place).font(.subheadline).foregroundStyle(.secondary) }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 12) {
                        if let temperature = now.temp {
                            Text(temperature).font(.system(size: 43, weight: .light, design: .rounded))
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            if let label = now.label { Text(label).font(.headline) }
                            if let high = weather.day?.hi, let low = weather.day?.lo {
                                Text("H \(high) · L \(low)").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    if let lead = weather.lead { Text(lead).foregroundStyle(.secondary) }
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func agenda(_ title: String, events: [BackendTodayEvent]) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            NativeCard {
                VStack(spacing: 12) {
                    ForEach(Array(events.prefix(12).enumerated()), id: \.offset) { index, event in
                        if index > 0 { Divider() }
                        HStack(alignment: .top, spacing: 11) {
                            if let timestamp = event.at {
                                Text(Date(timeIntervalSince1970: timestamp / 1000), style: .time)
                                    .font(.caption.weight(.medium)).monospacedDigit().foregroundStyle(.secondary)
                            }
                            if let route = event.app.flatMap({ InFliteRoute(rawValue: $0 == "chat" ? "chats" : $0) }) {
                                NativeAppIcon(route: route, size: 29)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(event.title ?? event.name ?? title).font(.subheadline.weight(.semibold))
                                if let sub = event.sub { Text(sub).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @MainActor
    private func refresh() async {
        guard !preview, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let next = try await BackendClient.shared.today(owner: user.id)
            guard !Task.isCancelled else { return }
            today = next
            failed = false
        } catch let error as BackendError where error.isAuthenticationRequired {
            if !Task.isCancelled { onSessionExpired() }
        } catch {
            if !Task.isCancelled { failed = true }
        }
    }
}
