import SwiftUI

// Native controls with the same soft corners and glass treatment as the surrounding cards.
struct InFliteButtonStyle: ButtonStyle {
    enum Emphasis: Equatable { case primary, secondary }
    var emphasis: Emphasis = .secondary
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(_ emphasis: Emphasis = .secondary) { self.emphasis = emphasis }

    func makeBody(configuration: Configuration) -> some View {
        let primary = emphasis == .primary
        let destructive = configuration.role == .destructive
        let ink: Color = primary ? .white : destructive ? .red : .primary
        let top: Color = primary
            ? Color(red: 0.19, green: 0.42, blue: 0.91)
            : Color.white.opacity(scheme == .dark ? 0.11 : 0.78)
        let bottom: Color = primary
            ? Color(red: 0.13, green: 0.32, blue: 0.76)
            : Color.white.opacity(scheme == .dark ? 0.06 : 0.48)
        return configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(ink)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frame(minHeight: 38)
            .background {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(LinearGradient(colors: [top, bottom], startPoint: .top, endPoint: .bottom))
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(Color.white.opacity(primary ? 0.22 : scheme == .dark ? 0.12 : 0.8)))
            .shadow(color: primary ? Color.blue.opacity(enabled ? 0.15 : 0.04) : .black.opacity(0.035), radius: 7, y: 3)
            .opacity(enabled ? 1 : 0.52)
            .scaleEffect(configuration.isPressed && enabled ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
            .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

struct TimeMenu: View {
    let title: String
    @Binding var selection: Int
    let values: [Int]
    var minutesPerValue = 1
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isEnabled) private var enabled

    private func clock(_ value: Int) -> String {
        let minutes = value * minutesPerValue
        return String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
    var body: some View {
        HStack(spacing: 10) {
            Text(title).font(.callout).foregroundStyle(.secondary)
            Menu {
                Picker(title, selection: $selection) {
                    ForEach(values, id: \.self) { value in Text(clock(value)).tag(value) }
                }
            } label: {
                HStack(spacing: 15) {
                    Text(clock(selection)).font(.system(size: 13, weight: .medium).monospacedDigit())
                    Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 13).padding(.vertical, 9)
                .background(Color.white.opacity(scheme == .dark ? 0.07 : 0.62), in: RoundedRectangle(cornerRadius: 11))
                .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(Color.white.opacity(scheme == .dark ? 0.10 : 0.8)))
                .opacity(enabled ? 1 : 0.52)
            }
            .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
            .accessibilityLabel(title).accessibilityValue(clock(selection))
        }
    }
}
