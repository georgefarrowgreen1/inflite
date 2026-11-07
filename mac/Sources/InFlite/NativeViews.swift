import SwiftUI
import InFliteCore

struct NativeSky: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        LinearGradient(colors: scheme == .dark
            ? [Color(red: 0.06, green: 0.09, blue: 0.19), Color(red: 0.03, green: 0.04, blue: 0.09), Color(red: 0.12, green: 0.07, blue: 0.20)]
            : [Color(red: 0.90, green: 0.91, blue: 0.99), Color(red: 0.97, green: 0.98, blue: 1), Color(red: 0.94, green: 0.91, blue: 0.99)],
            startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

struct NativeSignInView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            SiteLogo(name: "LogoInFlite", size: 86).shadow(color: .black.opacity(0.12), radius: 20, y: 10)
            Text("Today").font(.system(size: 38, weight: .bold)).tracking(-1)
            Text("Your day, from all your apps").foregroundStyle(.secondary).font(.system(size: 16))
            Spacer()
            if let message = model.message { Text(message).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 400) }
            Button("Sign in to InFlite") { model.signIn() }
                .buttonStyle(.borderedProminent).controlSize(.large).frame(width: 280).disabled(model.sampleData)
            Text("Your existing account. Sign-in opens in a secure web sheet.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Try again") { Task { await model.refresh() } }.buttonStyle(.borderless).disabled(model.refreshing)
        }.padding(42).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct NativeTodayView: View {
    @ObservedObject var model: AppModel
    private let columns = [GridItem(.adaptive(minimum: 270), spacing: 18)]
    private var dayStyle: Date.FormatStyle {
        var style = Date.FormatStyle().weekday(.wide).month(.wide).day()
        style.timeZone = TimeZone(identifier: model.day?.tz ?? "") ?? .current
        return style
    }
    var body: some View {
        if !model.hasLoaded {
            ProgressView("Getting your day…").frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if !model.signedIn {
            NativeSignInView(model: model)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(Date(timeIntervalSince1970: (model.day?.at ?? Date.now.timeIntervalSince1970 * 1000) / 1000).formatted(dayStyle))
                            .font(.callout).foregroundStyle(.secondary)
                        Text("Your day, \(model.session?.user?.first ?? model.userName)")
                            .font(.system(size: 31, weight: .bold)).tracking(-0.8)
                    }
                    if let message = model.message {
                        Label(message, systemImage: "exclamationmark.circle")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    if let day = model.day {
                        if let phase = day.phase, let top = day.tops?[phase], let title = top["title"].text {
                            VStack(alignment: .leading, spacing: 11) {
                                Text(title).font(.title3.weight(.semibold))
                                ForEach(Array(top["lines"].list.enumerated()), id: \.offset) { _, line in
                                    if let text = line.text { Text(text).font(.callout).foregroundStyle(.secondary) }
                                }
                                Button("Review day details on web") { model.showWebToday() }.buttonStyle(.bordered).disabled(model.sampleData)
                            }.padding(22).nativeGlass()
                        }
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 18) {
                            ForEach(CardKind.ordered(model.session?.prefs)) { kind in
                                NativeSummaryCard(kind: kind, card: day.cards[kind.rawValue]) { model.select(kind.destination) }.disabled(model.sampleData)
                            }
                        }
                        if CardKind.ordered(model.session?.prefs).isEmpty {
                            ContentUnavailableView("Your cards are hidden", systemImage: "rectangle.grid.2x2",
                                description: Text("Choose the cards you want to see in You."))
                        }
                        if let upcoming = day.upcoming, !upcoming.isEmpty {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Coming up").font(.title3.weight(.semibold))
                                ForEach(Array(upcoming.prefix(6).enumerated()), id: \.offset) { _, item in
                                    HStack(alignment: .top, spacing: 14) {
                                        if let at = item["at"].number {
                                            Text(Date(timeIntervalSince1970: at / 1000), style: .time)
                                                .font(.callout.monospacedDigit()).foregroundStyle(.secondary).frame(width: 65, alignment: .leading)
                                        }
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item["title"].text ?? "Upcoming").font(.callout.weight(.medium))
                                            if let sub = item["sub"].text { Text(sub).font(.caption).foregroundStyle(.secondary) }
                                        }
                                        Spacer()
                                    }
                                }
                                Button("See the full day") { model.showWebToday() }.buttonStyle(.borderless).disabled(model.sampleData)
                            }.padding(22).nativeGlass()
                        }
                    } else {
                        ContentUnavailableView("Your day couldn’t be loaded", systemImage: "arrow.clockwise",
                            description: Text("Your account is signed in. Refresh to try loading its summaries again."))
                        Button("Refresh") { Task { await model.refresh() } }.buttonStyle(.borderedProminent)
                    }
                    if let date = model.lastUpdated {
                        HStack(spacing: 5) { Text("Last loaded"); Text(date, style: .time) }
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(30).frame(maxWidth: 1050).frame(maxWidth: .infinity, alignment: .top)
            }
        }
    }
}

struct NativeSummaryCard: View {
    let kind: CardKind
    let card: JSONValue?
    let open: () -> Void
    private var value: JSONValue { card ?? .null }
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 11) {
                DestinationIcon(destination: kind.destination, size: 35)
                Text(kind.destination.title).font(.headline)
                Spacer()
                if value["state"].text == "error" { Image(systemName: "exclamationmark.circle").foregroundStyle(.secondary) }
            }
            if card == nil { Text("No summary received. Refresh to try again.").foregroundStyle(.secondary) }
            else if value["state"].text != "ok" { Text(value["said"].text ?? "This summary isn’t available right now.").foregroundStyle(.secondary) }
            else { summary }
            Spacer(minLength: 0)
            Button("Open \(kind.destination.title)", action: open).buttonStyle(.borderless)
                .help("Opens the existing web app")
        }
        .font(.callout).padding(21).frame(maxWidth: .infinity, minHeight: 210, alignment: .topLeading).nativeGlass()
    }
    @ViewBuilder private var summary: some View {
        switch kind {
        case .weather:
            HStack(alignment: .firstTextBaseline) {
                Text(value["now"]["temp"].text ?? "—").font(.system(size: 39, weight: .medium))
                VStack(alignment: .leading, spacing: 4) {
                    Text(value["place"]["name"].text ?? "Weather").font(.headline)
                    Text(value["now"]["label"].text ?? "").foregroundStyle(.secondary)
                }
            }
            if let lead = value["lead"].text { Text(lead).foregroundStyle(.secondary) }
            if let warning = value["warning"]["said"].text { Label(warning, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
        case .fitness:
            Text(value["session"]["name"].text ?? value["event"]["name"].text ?? (value["kind"].text == "rest" ? "Rest day" : "Today’s fitness"))
                .font(.title3.weight(.semibold))
            if let seconds = value["session"]["secs"].number { Text("\(Int(seconds / 60)) minutes").foregroundStyle(.secondary) }
            if let why = value["why"].text { Text(why).foregroundStyle(.secondary) }
            if let span = value["best"]["span"].text { Label("Best time · \(span)", systemImage: "clock").foregroundStyle(.secondary) }
            if let share = value["share"].text { Text(share).foregroundStyle(.secondary) }
        case .chat:
            if let count = value["inboundTotal"].number { Text("\(Int(count)) on the way").font(.title3.weight(.semibold)) }
            Text("\(value["unread"].list.count) conversations with unread messages").foregroundStyle(.secondary)
            Text("Chat’s full interface currently supports iPhone and iPad.").font(.caption).foregroundStyle(.secondary)
        case .markets:
            if let pct = value["pct"].number {
                Text(pct.formatted(.number.sign(strategy: .always()).precision(.fractionLength(1))) + "%")
                    .font(.system(size: 32, weight: .medium)).foregroundStyle(pct < 0 ? Color.red : Color.primary)
            }
            if let said = value["market"]["said"].text { Text(said).foregroundStyle(.secondary) }
            if value["stale"].flag == true { Label("Prices may be out of date", systemImage: "clock").font(.caption).foregroundStyle(.secondary) }
            if let count = value["owned"].number { Text("\(Int(count)) holdings").foregroundStyle(.secondary) }
        }
    }
}

struct NativeAppsView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Your apps").font(.system(size: 31, weight: .bold)).tracking(-0.8)
                Text("Today and You are native. Full app interfaces open in the web view as we bring them to SwiftUI.")
                    .font(.callout).foregroundStyle(.secondary)
                ForEach([Destination.weather, .fitness, .markets, .chats] + (model.session?.apps?["mail"] == true ? [.mail] : [])) { app in
                    Button { model.select(app) } label: {
                        HStack(spacing: 16) {
                            DestinationIcon(destination: app, size: 45)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(app.title).font(.headline)
                                Text(app.subtitle).font(.callout).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("Web").font(.caption).foregroundStyle(.secondary)
                            Image(systemName: "chevron.right").font(.caption)
                        }.padding(20).nativeGlass().contentShape(Rectangle())
                    }.buttonStyle(.plain).disabled(model.sampleData)
                }
            }.padding(30).frame(maxWidth: 900).frame(maxWidth: .infinity)
        }
    }
}

extension View {
    func nativeGlass() -> some View {
        modifier(NativeGlass())
    }
}

private struct NativeGlass: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(scheme == .dark ? 0.035 : 0.72))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.white.opacity(scheme == .dark ? 0.07 : 0.65)))
        .shadow(color: .black.opacity(scheme == .dark ? 0.03 : 0.025), radius: 14, y: 5)
    }
}
