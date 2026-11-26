import SwiftUI
import UIKit

enum NativeStyle {
    static let sheetInset: CGFloat = 16
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.71, green: 0.92, blue: 0.22, alpha: 1)
            : UIColor(red: 0.28, green: 0.43, blue: 0.10, alpha: 1)
    })
}

extension View {
    func nativeSheetChrome() -> some View {
        presentationDragIndicator(.visible)
            .presentationCornerRadius(30)
            .tint(NativeStyle.accent)
    }
}

struct NativeSheetCloseButton: View {
    var title = "Close"
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: "xmark")
                .labelStyle(.iconOnly)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: .circle)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
    }
}

struct NativeEmptyState: View {
    let title: String
    let symbol: String
    var message: String? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            if let message { Text(message) }
        }
    }
}

struct NativeWallpaper: View {
    let animate: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            ZStack {
                (scheme == .dark ? Color(red: 0.065, green: 0.055, blue: 0.10) : Color(red: 0.95, green: 0.94, blue: 0.93))
                orb(width * 0.57, colors: [.pink, .yellow, .cyan])
                    .position(x: width * 0.79, y: height * 0.21)
                    .offset(x: drift ? -18 : 0, y: drift ? 26 : 0)
                orb(width * 0.28, colors: [.yellow, .cyan, .purple])
                    .position(x: width * 0.27, y: height * 0.47)
                    .offset(y: drift ? -22 : 0)
                orb(width * 0.96, colors: [.cyan, .pink, .orange])
                    .position(x: width * 0.45, y: height * 0.90)
                    .offset(x: drift ? 34 : 0, y: drift ? -14 : 0)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: reduceMotion, initial: true) { _, reduced in
            if reduced || !animate {
                drift = false
            } else {
                withAnimation(.easeInOut(duration: 11).repeatForever(autoreverses: true)) { drift = true }
            }
        }
    }

    private func orb(_ diameter: CGFloat, colors: [Color]) -> some View {
        Circle()
            .fill(
                AngularGradient(colors: colors + Array(colors.prefix(1)), center: .center)
            )
            .overlay {
                Circle()
                    .fill(RadialGradient(colors: [.white.opacity(0.85), .clear], center: .init(x: 0.36, y: 0.31),
                                         startRadius: 0, endRadius: diameter * 0.60))
            }
            .frame(width: diameter, height: diameter)
            .blur(radius: 5)
            .opacity(scheme == .dark ? 0.37 : 0.29)
    }
}

struct NativeCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(17)
            .background(.regularMaterial, in: .rect(cornerRadius: 24))
            .overlay {
                RoundedRectangle(cornerRadius: 24)
                    .strokeBorder(.primary.opacity(0.11), lineWidth: 1)
                    .allowsHitTesting(false)
            }
    }
}

struct NativeAppIcon: View {
    let route: InFliteRoute
    let size: CGFloat

    var body: some View {
        Group {
            if let asset = route.iconAsset {
                Image(asset).resizable().scaledToFit()
                    .clipShape(.rect(cornerRadius: size * 0.23))
            } else {
                Image(systemName: route.symbol)
                    .font(.system(size: size * 0.65, weight: .medium))
                    .foregroundStyle(.primary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

extension InFliteRoute {
    var title: String {
        switch self {
        case .account: "Settings"
        case .about: "About InFlite"
        case .storage: "Cookies & Storage"
        default: rawValue.capitalized
        }
    }

    var symbol: String {
        switch self {
        case .today: "sun.max"
        case .weather: "cloud.sun"
        case .markets: "chart.bar.xaxis"
        case .fitness: "figure.run"
        case .mail: "envelope"
        case .chats: "bubble.left"
        case .calendar: "calendar"
        case .notes: "note.text"
        case .people: "person.2"
        case .status: "waveform.path"
        case .account: "gearshape"
        case .files: "folder"
        case .notifications: "bell"
        case .reminders: "list.bullet.circle"
        case .about: "info.circle"
        case .privacy: "hand.raised"
        case .support: "questionmark.circle"
        case .storage: "externaldrive"
        case .terms: "doc.text"
        }
    }

    var iconAsset: String? {
        switch self {
        case .today, .status, .account, .notifications, .reminders, .about, .privacy, .support, .storage, .terms: nil
        default: "Native-" + rawValue
        }
    }
}
