import SwiftUI

struct NativeWeatherView: View {
    private let agendaLaunch: TodayAgendaLaunch?
    @AppStorage private var selectedPlace: Data
    private let client = WeatherClient.shared
    @State private var place: WeatherPlace?
    @State private var section: Section = .now
    @State private var forecast: WeatherForecast?
    @State private var warnings: WeatherWarningFeed?
    @State private var radar: WeatherRadarFeed?
    @State private var frameIndex: Int?
    @State private var fetchedAt: [Request: Date] = [:]
    @State private var failure: String?
    @State private var loadID: UUID?
    @State private var showingPlaces = false
    @State private var showingCredits = false

    init(owner: String? = nil, agendaLaunch: TodayAgendaLaunch? = nil) {
        self.agendaLaunch = agendaLaunch
        _selectedPlace = AppStorage(wrappedValue: Data(), "inflite.native.weather.place.\(owner ?? "device")")
    }

    private enum Section: String, CaseIterable, Identifiable {
        case now = "Now"
        case forecast = "16 Days"
        case radar = "Radar"
        case warnings = "Warnings"

        var id: Self { self }

        var requestType: Request.Kind {
            switch self {
            case .now, .forecast: return .forecast
            case .radar: return .radar
            case .warnings: return .warnings
            }
        }
    }

    private struct Request: Hashable {
        enum Kind: Hashable { case forecast, radar, warnings }
        let place: WeatherPlace
        let kind: Kind
    }

    private var request: Request? { place.map { Request(place: $0, kind: section.requestType) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                Picker("Weather section", selection: $section) {
                    ForEach(Section.allCases) { section in
                        Text(section.rawValue).tag(section)
                    }
                }
                .pickerStyle(.segmented)

                if let failure {
                    HStack {
                        Text(failure)
                            .font(.subheadline)
                        Spacer()
                        Button("Retry") {
                            Task {
                                if let request { await load(request, force: true) }
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    .weatherCard()
                }

                switch section {
                case .now:
                    if let forecast { currentConditions(forecast) }
                    else if failure == nil { loadingView }
                case .forecast:
                    if let forecast { dailyForecast(forecast) }
                    else if failure == nil { loadingView }
                case .radar:
                    if let place, let radar { radarMap(radar, place: place) }
                    else if failure == nil { loadingView }
                case .warnings:
                    if let warnings { warningList(warnings) }
                    else if failure == nil { loadingView }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .accessibilityIdentifier("native-weather")
        .navigationTitle("Weather")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showingCredits = true
                } label: {
                    Label("Weather data", systemImage: "info.circle")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingPlaces = true
                } label: {
                    Label("Find a place", systemImage: "magnifyingglass")
                }
            }
        }
        .sheet(isPresented: $showingPlaces) {
            WeatherPlaceSearch(client: client, currentPlace: place, onSelect: select)
                .nativeSheetChrome()
        }
        .sheet(isPresented: $showingCredits) {
            WeatherCreditsSheet()
                .nativeSheetChrome()
        }
        .task { await chooseInitialPlace() }
        .task(id: request) {
            if let request { await load(request) }
        }
        .refreshable {
            if let request { await load(request, force: true) }
        }
        .onChange(of: section.requestType) { _, _ in failure = nil }
        .onChange(of: agendaLaunch, initial: true) { _, launch in
            switch launch?.destination {
            case .weatherRadar: section = .radar
            case .weatherForecast: section = .forecast
            case .weatherWarnings: section = .warnings
            default: break
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            if let place {
                Button {
                    showingPlaces = true
                } label: {
                    HStack(spacing: 8) {
                        Text(place.name).font(.largeTitle.bold())
                        Image(systemName: "chevron.down").font(.footnote.weight(.semibold))
                    }
                }
                .buttonStyle(.plain)
                if let region = place.region, !region.isEmpty {
                    Text(region).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var loadingView: some View {
        ProgressView("Loading weather")
            .frame(maxWidth: .infinity, minHeight: 180)
    }

    private func currentConditions(_ forecast: WeatherForecast) -> some View {
        let now = forecast.current
        let condition = WeatherCondition(code: now.code, isDay: now.isDay != 0)
        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(weatherTemperature(now.temperature))
                            .font(.system(size: 64, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                        Text(condition.label).font(.title3.weight(.semibold))
                    }
                    Spacer(minLength: 12)
                    Image(systemName: condition.icon)
                        .symbolRenderingMode(.multicolor)
                        .font(.system(size: 48))
                        .accessibilityHidden(true)
                }
                if let today = forecast.daily.readings.first {
                    Text("H \(weatherTemperature(today.high)) · L \(weatherTemperature(today.low))")
                        .font(.subheadline.weight(.medium))
                }
                if let rain = forecast.shortRainOutlook {
                    Label(rain, systemImage: "drop").font(.subheadline)
                }
            }
            .weatherCard()

            let hours = forecast.hourly.readings(after: now.time)
            if !hours.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Next 48 hours", systemImage: "clock").font(.headline)
                    ScrollView(.horizontal) {
                        HStack(spacing: 12) {
                            ForEach(hours) { hour in
                                VStack(spacing: 8) {
                                    Text(hour.id <= now.time ? "Now" : forecast.time(hour.id))
                                        .font(.caption.weight(.semibold))
                                    let sky = WeatherCondition(code: hour.code, isDay: hour.isDay)
                                    Image(systemName: sky.icon)
                                        .symbolRenderingMode(.multicolor)
                                        .accessibilityLabel(sky.label)
                                    Text(weatherTemperature(hour.temperature))
                                        .font(.subheadline.weight(.semibold))
                                    if let chance = hour.rainChance {
                                        Text("\(chance)%")
                                            .font(.caption2)
                                            .foregroundStyle(Color.blue)
                                            .accessibilityLabel("\(chance) percent chance of rain")
                                    }
                                }
                                .monospacedDigit()
                                .frame(minWidth: 52)
                                .padding(.vertical, 8)
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                .weatherCard()
            }

            let metrics: [(String, String, String?)] = [
                ("Feels like", "thermometer.medium", now.feelsLike.map { weatherTemperature($0) }),
                ("Humidity", "humidity", now.humidity.map { "\($0)%" }),
                ("Wind", "wind", now.wind.map { String(format: "%.0f mph", $0) }),
                ("Gusts", "wind.circle", now.windGusts.map { String(format: "%.0f mph", $0) }),
                ("UV index", "sun.max", now.uv.map { String(format: "%.1f", $0) }),
                ("Sunrise", "sunrise", forecast.daily.readings.first?.sunrise.map(forecast.time)),
                ("Sunset", "sunset", forecast.daily.readings.first?.sunset.map(forecast.time))
            ]
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 135))], spacing: 12) {
                ForEach(metrics.indices, id: \.self) { index in
                    if let value = metrics[index].2 {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(metrics[index].0, systemImage: metrics[index].1)
                                .font(.subheadline).foregroundStyle(.secondary)
                            Text(value).font(.title3.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .weatherCard()
                    }
                }
            }
            forecastCredit
        }
    }

    private func dailyForecast(_ forecast: WeatherForecast) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                ForEach(forecast.daily.readings) { day in
                    let sky = WeatherCondition(code: day.code, isDay: true)
                    HStack(spacing: 12) {
                        Text(day.id == forecast.daily.time.first ? "Today" : forecast.weekday(day.id))
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: sky.icon)
                            .symbolRenderingMode(.multicolor)
                            .frame(width: 27)
                            .accessibilityLabel(sky.label)
                        if let chance = day.rainChance {
                            Text("\(chance)%")
                                .foregroundStyle(Color.blue)
                                .font(.caption)
                                .frame(minWidth: 33)
                                .accessibilityLabel("\(chance) percent chance of rain")
                        }
                        Text(weatherTemperature(day.low)).foregroundStyle(.secondary)
                        Text(weatherTemperature(day.high)).bold()
                    }
                    .font(.subheadline)
                    .monospacedDigit()
                    .padding(.vertical, 12)
                    .accessibilityElement(children: .combine)
                    if day.id != forecast.daily.time.last { Divider() }
                }
            }
            .weatherCard()
            forecastCredit
        }
    }

    private var forecastCredit: some View {
        Button("Weather data") { showingCredits = true }
            .font(.footnote)
    }

    private func warningList(_ feed: WeatherWarningFeed) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if feed.missing?.isEmpty == false {
                Label("Some warning services are unavailable", systemImage: "exclamationmark.circle")
                    .font(.subheadline)
                    .weatherCard()
            }
            if feed.warnings.isEmpty && failure == nil {
                let unavailable = feed.uncovered == true || feed.missing?.isEmpty == false
                Label(unavailable ? "Full warning coverage is unavailable" : "No warnings in force",
                      systemImage: unavailable ? "exclamationmark.shield" : "checkmark.shield")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .weatherCard()
            }
            ForEach(feed.warnings) { warning in
                VStack(alignment: .leading, spacing: 8) {
                    Label(warning.event, systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(warning.level >= 4 ? Color.red : Color.orange, Color.primary)
                    if let issuer = warning.issuer, !issuer.isEmpty {
                        Text(issuer).font(.footnote).foregroundStyle(.secondary)
                    }
                    if let area = warning.area, !area.isEmpty {
                        Text(area).font(.subheadline)
                    }
                    if let headline = warning.headline, headline != warning.event, !headline.isEmpty {
                        Text(headline).font(.subheadline.weight(.semibold))
                    }
                    if let description = warning.description, !description.isEmpty {
                        Text(description).font(.subheadline)
                    }
                    if let instruction = warning.instruction, !instruction.isEmpty {
                        Text(instruction).font(.subheadline)
                    }
                    if let url = warning.link, url.scheme?.lowercased() == "https" {
                        Link("Official warning", destination: url).font(.subheadline.weight(.semibold))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .weatherCard()
            }
        }
    }

    @ViewBuilder
    private func radarMap(_ radar: WeatherRadarFeed, place: WeatherPlace) -> some View {
        let frames = radar.frames
        if let latest = frames.last {
            let index = min(max(frameIndex ?? frames.count - 1, 0), frames.count - 1)
            let frame = frames[index]
            VStack(alignment: .leading, spacing: 12) {
                WeatherRadarMap(place: place, tileTemplate: radar.tileTemplate(for: frame))
                    .frame(height: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .accessibilityLabel("Rain radar map")
                HStack {
                    Label(Date(timeIntervalSince1970: TimeInterval(frame.time)).formatted(date: .omitted, time: .shortened),
                          systemImage: "clock")
                    Spacer()
                    Button("Latest") { frameIndex = nil }
                        .disabled(frame.id == latest.id)
                }
                .font(.subheadline)
                if frames.count > 1 {
                    Slider(value: Binding(
                        get: { Double(index) },
                        set: { frameIndex = Int($0) }
                    ), in: 0...Double(frames.count - 1), step: 1)
                    .accessibilityLabel("Radar frame")
                }
                Button("Map data") { showingCredits = true }
                    .font(.footnote)
            }
            .weatherCard()
        }
    }

    private func chooseInitialPlace() async {
        guard place == nil else { return }
        if let saved = try? JSONDecoder().decode(WeatherPlace.self, from: selectedPlace), saved.isValid {
            place = saved
            return
        }
        let approximate = try? await client.approximatePlace()
        guard !Task.isCancelled, place == nil else { return }
        place = approximate ?? .london
    }

    private func select(_ choice: WeatherPlace) {
        guard choice.isValid, choice != place else { return }
        selectedPlace = (try? JSONEncoder().encode(choice)) ?? Data()
        place = choice
        forecast = nil
        warnings = nil
        frameIndex = nil
        fetchedAt.removeAll()
        failure = nil
    }

    private func load(_ request: Request, force: Bool = false) async {
        if !force, let last = fetchedAt[request], Date().timeIntervalSince(last) < 300 { return }
        let id = UUID()
        loadID = id
        failure = nil
        do {
            switch request.kind {
            case .forecast:
                let result = try await client.forecast(for: request.place)
                guard loadID == id, self.request == request, !Task.isCancelled else { return }
                forecast = result
            case .warnings:
                let result = try await client.warnings(for: request.place)
                guard loadID == id, self.request == request, !Task.isCancelled else { return }
                warnings = result.retainingWarnings(from: warnings)
            case .radar:
                let result = try await client.radar()
                guard loadID == id, self.request == request, !Task.isCancelled else { return }
                radar = result
                frameIndex = nil
            }
            fetchedAt[request] = Date()
        } catch {
            guard loadID == id, self.request == request, !Task.isCancelled else { return }
            let service: String
            switch request.kind {
            case .forecast: service = "the forecast"
            case .warnings: service = "weather warnings"
            case .radar: service = "rain radar"
            }
            failure = "Couldn’t load \(service)."
        }
    }
}

private struct WeatherCreditsSheet: View {
    @Environment(\.dismiss) private var dismiss

    private struct Source: Identifiable {
        let title: String
        let detail: String
        let url: URL

        var id: String { title }

        init(_ title: String, _ detail: String, _ address: String) {
            self.title = title
            self.detail = detail
            url = URL(string: address)!
        }
    }

    private let weatherSources: [Source] = [
        Source("Open-Meteo", "Forecasts, ensembles & waves · CC BY 4.0", "https://open-meteo.com/"),
        Source("Met Office", "UK forecasts & ensembles · CC BY-SA 4.0", "https://www.metoffice.gov.uk/"),
        Source("ERA5 · Copernicus Climate", "Climate history · via Open-Meteo", "https://climate.copernicus.eu/"),
        Source("CAMS · Copernicus Atmosphere", "Air quality & pollen · via Open-Meteo", "https://atmosphere.copernicus.eu/"),
        Source("Copernicus Marine", "Sea temperature & tides · via Open-Meteo", "https://marine.copernicus.eu/"),
        Source("MeteoAlarm · EUMETNET", "European weather warnings · CC BY 4.0", "https://meteoalarm.org/"),
        Source("National Weather Service", "US weather warnings", "https://www.weather.gov/"),
        Source("Environment Agency", "England flood warnings · Open Government Licence", "https://environment.data.gov.uk/flood-monitoring/doc/reference"),
        Source("Aviation Weather Center", "Airport weather reports", "https://aviationweather.gov/")
    ]

    var body: some View {
        NavigationStack {
            List {
                HStack(spacing: 9) {
                    Image("InFliteMark").resizable().scaledToFit()
                        .frame(width: 36, height: 36)
                        .clipShape(.rect(cornerRadius: 9))
                        .accessibilityHidden(true)
                    Text("InFlite").fontWeight(.bold)
                    Text("a GFG company").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
                .accessibilityElement(children: .combine)
                Section("Weather data") {
                    ForEach(weatherSources) { source in sourceRow(source) }
                }
                Section("Map data") {
                    sourceRow(Source("RainViewer", "Radar imagery", "https://www.rainviewer.com/"))
                    sourceRow(Source("Apple Maps", "Base map", "https://www.apple.com/maps/"))
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Weather data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    NativeSheetCloseButton { dismiss() }
                }
            }
        }
    }

    private func sourceRow(_ source: Source) -> some View {
        Link(destination: source.url) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(source.title).font(.body.weight(.medium))
                    Text(source.detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            }
            .foregroundStyle(.primary)
        }
    }
}

private struct WeatherCondition {
    let label: String
    let icon: String

    init(code: Int?, isDay: Bool) {
        switch code {
        case 0: (label, icon) = ("Clear", isDay ? "sun.max.fill" : "moon.stars.fill")
        case 1, 2: (label, icon) = ("Partly cloudy", isDay ? "cloud.sun.fill" : "cloud.moon.fill")
        case 3: (label, icon) = ("Overcast", "cloud.fill")
        case 45, 48: (label, icon) = ("Fog", "cloud.fog.fill")
        case 51, 53, 55: (label, icon) = ("Drizzle", "cloud.drizzle.fill")
        case 56, 57, 66, 67: (label, icon) = ("Freezing rain", "cloud.sleet.fill")
        case 61, 63, 65: (label, icon) = ("Rain", "cloud.rain.fill")
        case 71, 73, 75, 77, 85, 86: (label, icon) = ("Snow", "cloud.snow.fill")
        case 80, 81, 82: (label, icon) = ("Showers", "cloud.heavyrain.fill")
        case 95, 96, 99: (label, icon) = ("Thunderstorms", "cloud.bolt.rain.fill")
        default: (label, icon) = ("Conditions unavailable", "cloud")
        }
    }
}

private func weatherTemperature(_ value: Double?) -> String {
    value.map { String(format: "%.0f°", $0) } ?? "—"
}

private extension View {
    func weatherCard() -> some View {
        NativeCard { self }
    }
}

private struct WeatherPlaceSearch: View {
    let client: WeatherClient
    let currentPlace: WeatherPlace?
    let onSelect: (WeatherPlace) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var places: [WeatherPlace] = []
    @State private var status = ""
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let currentPlace {
                    placeRow(currentPlace)
                }
                ForEach(places, id: \.self) { place in placeRow(place) }
                if searching {
                    ProgressView("Finding places")
                } else if !status.isEmpty {
                    Text(status).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Places")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search for a city")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    NativeSheetCloseButton { dismiss() }
                }
            }
            .task(id: query) { await search(query) }
        }
    }

    private func placeRow(_ place: WeatherPlace) -> some View {
        Button {
            onSelect(place)
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(place.name).foregroundStyle(.primary)
                if let region = place.region, !region.isEmpty {
                    Text(region).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func search(_ query: String) async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        places = []
        status = ""
        searching = text.count >= 2
        guard searching else { return }
        do {
            try await Task.sleep(for: .milliseconds(300))
            let matches = try await client.findPlaces(named: text)
            guard !Task.isCancelled else { return }
            var unique = Set<WeatherPlace>()
            places = matches.filter { unique.insert($0).inserted }
            if places.isEmpty { status = "No places found" }
        } catch {
            guard !Task.isCancelled else { return }
            status = "Couldn’t search for places."
        }
        searching = false
    }
}
