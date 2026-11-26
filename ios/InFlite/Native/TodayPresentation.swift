import CryptoKit
import SwiftUI

private struct InFliteScreenVisibilityKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var isInFliteScreenVisible: Bool {
        get { self[InFliteScreenVisibilityKey.self] }
        set { self[InFliteScreenVisibilityKey.self] = newValue }
    }
}

enum NativeProtectedFile {
    static func write(_ data: Data, to url: URL) throws {
        var directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var properties = URLResourceValues()
        properties.isExcludedFromBackup = true
        try directory.setResourceValues(properties)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}

// A read-only subset of Today for the launch screen. The application shell
// still waits for server authentication before opening apps or enabling writes.
struct TodayPresentationSnapshot: Codable, Sendable {
    let owner: String
    let updatedAt: Date
    let expiresAt: Date
    let title: String?
    let lines: [String]
    let place: String?
    let weather: String?

    init?(cards: BackendToday, owner: String, expiresAt sessionExpiry: Date, now: Date = .now) {
        let summary = cards.phase.flatMap { cards.tops?[$0] } ?? cards.tops?["morning"]
        let weatherCard = cards.cards?.weather
        title = Self.clipped(summary?.title)
        lines = (summary?.lines ?? []).prefix(4).compactMap { Self.clipped($0) }
        place = Self.clipped(weatherCard?.place?.name)
        let conditions = [weatherCard?.now?.temp, weatherCard?.now?.label].compactMap { Self.clipped($0) }
        weather = conditions.isEmpty ? nil : conditions.joined(separator: " · ")
        self.owner = owner
        let sourceDate = cards.at.flatMap { timestamp -> Date? in
            guard timestamp.isFinite, timestamp > 0 else { return nil }
            let date = Date(timeIntervalSince1970: timestamp / 1000)
            return min(date, now)
        }
        updatedAt = sourceDate ?? now
        expiresAt = min(sessionExpiry, now.addingTimeInterval(24 * 60 * 60))
        guard title != nil || !lines.isEmpty || weather != nil else { return nil }
    }

    private static func clipped(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return String(value.prefix(240))
    }

    #if DEBUG
    static var smokeSample: Self {
        let summary = BackendTodayTop(kind: nil, chip: nil, title: "Sample day summary",
                                      lines: ["A saved summary from Today."], stats: nil)
        let cards = BackendToday(at: nil, tz: nil, phase: "morning", cards: nil,
                                 tops: ["morning": summary], upcoming: nil, waiting: nil)
        return Self(cards: cards, owner: "preview", expiresAt: .now.addingTimeInterval(300))!
    }
    #endif
}

struct TodayPresentationCache: Sendable {
    private struct Entry: Codable {
        let sessionBinding: Data
        let snapshot: TodayPresentationSnapshot
    }

    private let file: URL

    init(file: URL = URL.applicationSupportDirectory.appending(path: "InFlite/Today/presentation-v1.json")) {
        self.file = file
    }

    func read(token: String, owner: String?, now: Date = .now) -> TodayPresentationSnapshot? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        guard let entry = try? JSONDecoder().decode(Entry.self, from: data),
              entry.sessionBinding == Self.binding(for: token),
              owner == nil || owner == entry.snapshot.owner,
              entry.snapshot.updatedAt <= now,
              entry.snapshot.expiresAt > now else {
            clear()
            return nil
        }
        return entry.snapshot
    }

    func write(_ snapshot: TodayPresentationSnapshot, token: String) {
        let entry = Entry(sessionBinding: Self.binding(for: token), snapshot: snapshot)
        guard let data = try? JSONEncoder().encode(entry) else { return }
        try? NativeProtectedFile.write(data, to: file)
    }

    func clear() {
        try? FileManager.default.removeItem(at: file)
    }

    private static func binding(for token: String) -> Data {
        Data(SHA256.hash(data: Data(token.utf8)))
    }
}

struct CachedTodayView: View {
    let snapshot: TodayPresentationSnapshot
    let refreshing: Bool
    let retry: () -> Void
    @State private var expired = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 17) {
                Text("Today")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                if !expired && snapshot.expiresAt > .now {
                    summary
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("cached-today-preview")
                }
                if refreshing {
                    ProgressView("Refreshing Today")
                } else {
                    NativeCard {
                        VStack(alignment: .leading, spacing: 9) {
                            Text("Today couldn’t refresh")
                                .font(.headline)
                            Button("Try again", action: retry).buttonStyle(.bordered)
                        }
                    }
                }
            }
            .frame(maxWidth: 590)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .task(id: snapshot.expiresAt) {
            expired = false
            let remaining = snapshot.expiresAt.timeIntervalSinceNow
            if remaining > 0 {
                do { try await Task.sleep(for: .seconds(remaining)) }
                catch { return }
            }
            expired = true
        }
    }

    private var summary: some View {
        NativeCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Last saved")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                if let title = snapshot.title {
                    Text(title).font(.title2.bold())
                }
                ForEach(Array(snapshot.lines.enumerated()), id: \.offset) { _, line in
                    Text(line).foregroundStyle(.secondary)
                }
                if let weather = snapshot.weather {
                    Label(weather, systemImage: "cloud.sun")
                        .font(.subheadline)
                    if let place = snapshot.place {
                        Text(place).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Text("Updated \(snapshot.updatedAt, format: .dateTime.month(.abbreviated).day().hour().minute())")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
