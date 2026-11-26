import Charts
import SwiftUI

@MainActor
struct ActivityMarketsView: View {
    let owner: String

    var body: some View {
        ActivityMarketsScreen(owner: owner).id(owner)
    }
}

@MainActor
private struct ActivityMarketsScreen: View {
    enum Destination: String, CaseIterable {
        case portfolio = "Portfolio"
        case news = "News"
    }

    let owner: String
    @State private var portfolio = ActivityResource<ActivityMarketSnapshot>()
    @State private var news = ActivityResource<ActivityMarketNews>()
    @State private var destination: Destination = .portfolio

    var body: some View {
        List {
            if let snapshot = portfolio.value {
                Picker("Markets", selection: $destination) {
                    ForEach(Destination.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)

                if destination == .portfolio {
                    portfolioRows(snapshot)
                    if let issue = portfolio.issue { ActivityLoadRow(issue: issue, retry: loadPortfolio) }
                } else {
                    newsRows(snapshot)
                }
            } else {
                ActivityLoadRow(issue: portfolio.issue, retry: loadPortfolio)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Markets")
        .task { await loadPortfolio() }
        .task(id: destination) {
            if destination == .news, news.value == nil { await loadNews() }
        }
        .refreshable {
            if destination == .news { await loadNews() } else { await loadPortfolio() }
        }
    }

    @ViewBuilder
    private func portfolioRows(_ snapshot: ActivityMarketSnapshot) -> some View {
        let owned = snapshot.positions.filter { $0.qty > 0 }
        let followed = snapshot.positions.filter { $0.qty == 0 }
        let values = owned.compactMap { snapshot.value(of: $0) }
        let total = values.reduce(0, +) + snapshot.balances.map(\.amount).reduce(0, +)
        let unpriced = owned.count - values.count

        if !values.isEmpty || !snapshot.balances.isEmpty {
            Section {
                VStack(alignment: .leading, spacing: 5) {
                    Text(total, format: .currency(code: "GBP"))
                        .font(.largeTitle.weight(.semibold))
                        .monospacedDigit()
                    Text(unpriced == 0 ? "Holdings and cash" : "Priced holdings and cash")
                        .foregroundStyle(.secondary)
                    if unpriced > 0 {
                        Text("\(unpriced) without a price or exchange rate")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 8)
            }
        }

        if !snapshot.benchmarks.isEmpty {
            Section("Market overview") {
                ForEach(snapshot.benchmarks, id: \.self) { symbol in
                    marketLink(
                        symbol: symbol, name: snapshot.quotes?[symbol]?.name ?? symbol,
                        quote: snapshot.quotes?[symbol]
                    )
                }
            }
        }

        Section("Holdings") {
            if owned.isEmpty {
                Text("No invested holdings yet").foregroundStyle(.secondary)
            }
            ForEach(owned) { position in
                marketLink(symbol: position.symbol, name: position.name, quote: snapshot.quotes?[position.symbol])
            }
        }
        if !snapshot.balances.isEmpty {
            Section("Cash") {
                ForEach(snapshot.balances) { balance in
                    LabeledContent(balance.name, value: balance.amount.formatted(.currency(code: "GBP")))
                }
            }
        }

        Section("Watchlist") {
            if followed.isEmpty {
                Text("Your watchlist is empty").foregroundStyle(.secondary)
            }
            ForEach(followed) { position in
                marketLink(symbol: position.symbol, name: position.name, quote: snapshot.quotes?[position.symbol])
            }
        }

        if let timestamp = snapshot.asOf {
            Section {
                Text("Updated \(timestamp, format: .relative(presentation: .named))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func marketLink(symbol: String, name: String, quote: ActivityQuote?) -> some View {
        NavigationLink {
            ActivityMarketDetail(owner: owner, symbol: symbol, name: name, quote: quote)
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(name).font(.body.weight(.semibold))
                    Text(symbol).font(.footnote).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 4) {
                    if let price = quote?.priceLabel {
                        Text(price).monospacedDigit()
                    } else {
                        Text("No quote").foregroundStyle(.secondary)
                    }
                    if let change = quote?.chgPct {
                        ActivityQuoteChange(value: change)
                    }
                }
            }
            .padding(.vertical, 3)
        }
    }

    @ViewBuilder
    private func newsRows(_ snapshot: ActivityMarketSnapshot) -> some View {
        if snapshot.newsSymbols.isEmpty {
            Text("No market news topics are available.").foregroundStyle(.secondary)
        } else if let articles = news.value?.news {
            if articles.isEmpty {
                Text("No recent stories").foregroundStyle(.secondary)
            }
            ForEach(articles) { article in
                if let url = article.articleURL {
                    Link(destination: url) { ActivityNewsLabel(article: article) }
                } else {
                    ActivityNewsLabel(article: article)
                }
            }
            if let issue = news.issue { ActivityLoadRow(issue: issue, retry: loadNews) }
        } else {
            ActivityLoadRow(issue: news.issue, retry: loadNews)
        }
    }

    private func loadPortfolio() async {
        await portfolio.load {
            let response = try await BackendClient.shared.request(
                ActivityMarketSnapshot.self, path: "/api/markets/me", owner: owner
            )
            return try response.validated(for: owner)
        }
    }

    private func loadNews() async {
        guard let symbols = portfolio.value?.newsSymbols, !symbols.isEmpty else { return }
        await news.load {
            try await BackendClient.shared.request(
                ActivityMarketNews.self, path: "/api/markets/news",
                query: [URLQueryItem(name: "s", value: symbols.joined(separator: ","))], owner: owner
            )
        }
    }
}

private struct ActivityQuoteChange: View {
    let value: Double

    var body: some View {
        Text((value > 0 ? "+" : "") + value.formatted(.number.precision(.fractionLength(2))) + "%")
            .font(.footnote.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(value > 0 ? Color.green : value < 0 ? Color.red : Color.secondary)
    }
}

private struct ActivityNewsLabel: View {
    let article: ActivityMarketNews.Item

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(article.title).font(.body.weight(.semibold)).foregroundStyle(.primary)
            HStack {
                if !article.src.isEmpty { Text(article.src) }
                Text(article.date, format: .relative(presentation: .named))
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

@MainActor
private struct ActivityMarketDetail: View {
    enum Range: String, CaseIterable {
        case day = "1d"
        case week = "5d"
        case month = "1mo"
        case year = "1y"

        var title: String {
            switch self {
            case .day: "1D"
            case .week: "5D"
            case .month: "1M"
            case .year: "1Y"
            }
        }
    }

    let owner: String
    let symbol: String
    let name: String
    let quote: ActivityQuote?
    @State private var range: Range = .day

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(symbol).font(.subheadline).foregroundStyle(.secondary)
                    if let price = quote?.priceLabel {
                        Text(price).font(.largeTitle.weight(.semibold)).monospacedDigit()
                    }
                    if let change = quote?.chgPct { ActivityQuoteChange(value: change) }
                    if let date = quote?.pricedAt {
                        Text("Quote time \(date, format: .dateTime.month(.abbreviated).day().hour().minute())")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 8)
            }
            Section("Price history") {
                Picker("Range", selection: $range) {
                    ForEach(Range.allCases, id: \.self) { item in
                        Text(item.title).tag(item)
                    }
                }
                .pickerStyle(.segmented)
                ActivityChartRow(owner: owner, symbol: symbol, range: range.rawValue).id(range)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

@MainActor
private struct ActivityChartRow: View {
    let owner: String
    let symbol: String
    let range: String
    @State private var history = ActivityResource<ActivityMarketChart>()

    var body: some View {
        Group {
            if let chart = history.value {
                let points = chart.points
                if points.count > 1 {
                    Chart(points) { point in
                        LineMark(x: .value("Date", point.date), y: .value("Price", point.price))
                            .foregroundStyle(.green)
                    }
                    .chartYScale(domain: .automatic(includesZero: false))
                    .frame(height: 168)
                    .accessibilityLabel(Text(chart.cur.isEmpty ? "Price history" : "Price history in \(chart.cur)"))
                } else {
                    Text("No price history for this range").foregroundStyle(.secondary)
                }
            } else {
                ActivityLoadRow(issue: history.issue, retry: load)
            }
        }
        .task { await load() }
    }

    private func load() async {
        await history.load {
            try await BackendClient.shared.request(
                ActivityMarketChart.self, path: "/api/markets/chart",
                query: [URLQueryItem(name: "s", value: symbol), URLQueryItem(name: "r", value: range)],
                owner: owner
            )
        }
    }
}

@MainActor
struct ActivityLoadRow: View {
    let issue: String?
    let retry: () async -> Void

    var body: some View {
        if let issue {
            VStack(alignment: .leading, spacing: 8) {
                Text(issue).foregroundStyle(.secondary)
                Button("Try again") { Task { await retry() } }
                    .buttonStyle(.borderless)
            }
            .padding(.vertical, 6)
        } else {
            ProgressView().frame(maxWidth: .infinity).padding()
        }
    }
}
