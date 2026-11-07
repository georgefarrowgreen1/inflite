import SwiftUI
import InFliteCore

struct WorkspaceView: View {
    @ObservedObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                HStack {
                    Label("YOUR MAC WORKSPACE", systemImage: "desktopcomputer")
                        .font(.system(size: 10, weight: .semibold)).tracking(1.6).foregroundStyle(.secondary)
                    Spacer()
                    Text(Date.now, format: .dateTime.weekday(.wide).month(.abbreviated).day())
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                }
                HStack(alignment: .center, spacing: 24) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("A little more room\nfor your day.")
                            .font(.system(size: 42, weight: .medium, design: .rounded)).tracking(-1.8).lineSpacing(-1)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Your day, your people, your next adventure.\nAll together in InFlite.")
                            .font(.system(size: 14)).foregroundStyle(.secondary).lineSpacing(5)
                        Button { model.select(.today) } label: {
                            HStack(spacing: 10) { Text("Open Today"); Image(systemName: "arrow.right") }
                                .padding(.horizontal, 9).padding(.vertical, 5)
                        }
                        .buttonStyle(.borderedProminent).controlSize(.large).padding(.top, 10)
                        Text("Your existing InFlite account. A new place to settle in.")
                            .font(.system(size: 10)).foregroundStyle(.tertiary).padding(.top, 1)
                    }
                    Spacer(minLength: 0)
                    OrbitArtwork().frame(width: 220, height: 230).accessibilityHidden(true)
                }
                .padding(30)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    RoundedRectangle(cornerRadius: 22)
                        .fill(LinearGradient(colors: [Color.purple.opacity(0.08), Color.blue.opacity(0.045), Color.orange.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing))
                }
                .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.primary.opacity(0.035)))

                HStack(alignment: .firstTextBaseline) {
                    Text("Make yourself at home.").font(.system(size: 19, weight: .medium, design: .rounded)).tracking(-0.4)
                    Spacer()
                    Text("Jump between apps with ⌘K").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach([Destination.mail, .weather, .fitness, .markets]) { destination in
                        AppCard(destination: destination) { model.select(destination) }
                    }
                }
                HStack(spacing: 12) {
                    Image(systemName: "person.crop.circle.badge.checkmark").font(.system(size: 22)).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("One account. Your own space.").font(.system(size: 12, weight: .medium))
                        Text("Sign in to get started. Mail is currently available to the account’s owner.")
                            .font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Your account") { model.select(.account) }.buttonStyle(.bordered)
                }.padding(.vertical, 5)
            }
            .padding(34).frame(maxWidth: 1050)
            .frame(maxWidth: .infinity)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.45))
    }
}

struct AppCard: View {
    let destination: Destination
    let action: () -> Void
    @State private var hovered = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: 15) {
                Image(systemName: destination.symbol).font(.system(size: 20, weight: .medium))
                    .foregroundStyle(destination.tint)
                    .frame(width: 48, height: 48).background(destination.tint.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 5) {
                    Text(destination.title).font(.system(size: 15, weight: .semibold))
                    Text(destination.subtitle).font(.system(size: 11)).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.system(size: 12)).foregroundStyle(.tertiary)
            }
            .padding(19).frame(maxWidth: .infinity, minHeight: 92)
            .background(hovered ? destination.tint.opacity(0.05) : Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.primary.opacity(hovered ? 0.12 : 0.06)))
            .contentShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain).onHover { hovered = $0 }.accessibilityLabel("Open \(destination.title). \(destination.subtitle)")
    }
}

struct OrbitArtwork: View {
    var body: some View {
        ZStack {
            Circle().fill(Color.purple.opacity(0.08)).frame(width: 200, height: 200).blur(radius: 25)
            Circle().stroke(.primary.opacity(0.045), lineWidth: 1).frame(width: 210, height: 210)
            Circle().stroke(.primary.opacity(0.055), lineWidth: 1).frame(width: 155, height: 155)
            BrandMark(size: 92).rotationEffect(.degrees(-9)).shadow(color: .purple.opacity(0.15), radius: 24, y: 15)
            orbitTile(.mail, x: 82, y: -68, angle: 9)
            orbitTile(.weather, x: -74, y: -64, angle: -12)
            orbitTile(.fitness, x: -75, y: 77, angle: -7)
            orbitTile(.markets, x: 80, y: 73, angle: 12)
            Circle().fill(Color.orange.opacity(0.55)).frame(width: 6, height: 6).offset(x: 5, y: -104)
            Circle().fill(Color.purple.opacity(0.4)).frame(width: 5, height: 5).offset(x: 18, y: 111)
        }
    }
    private func orbitTile(_ destination: Destination, x: CGFloat, y: CGFloat, angle: Double) -> some View {
        Image(systemName: destination.symbol).font(.system(size: 20, weight: .medium)).foregroundStyle(destination.tint)
            .frame(width: 53, height: 53).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.5)))
            .shadow(color: .black.opacity(0.06), radius: 12, y: 6).rotationEffect(.degrees(angle)).offset(x: x, y: y)
    }
}

struct ChatAvailabilityView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Chats travel with your phone", systemImage: "iphone.and.arrow.forward")
        } description: {
            Text("InFlite Chat currently supports iPhone and iPad.\nYour conversations stay there while we work on a Mac experience.")
        } actions: {
            Text("Open chat.inflite.ai on your iPhone or iPad.").textSelection(.enabled).font(.callout).foregroundStyle(.secondary)
        }
    }
}
