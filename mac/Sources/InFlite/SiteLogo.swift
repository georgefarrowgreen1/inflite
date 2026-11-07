import SwiftUI
import InFliteCore

extension Destination {
    var siteLogoName: String? {
        switch self {
        case .apps: return nil
        case .you: return "LogoAccount"
        case .today, .webToday: return "LogoInFlite"
        case .mail: return "LogoMail"
        case .chats: return "LogoChats"
        case .weather: return "LogoWeather"
        case .fitness: return "LogoFitness"
        case .markets: return "LogoMarkets"
        case .account: return "LogoAccount"
        }
    }
}

// Full-colour originals compiled from the site's SVGs. Never template or recolour the marks.
struct SiteLogo: View {
    let name: String
    let size: CGFloat
    var body: some View {
        Image(name, bundle: .main)
            .resizable().renderingMode(.original)
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct DestinationIcon: View {
    let destination: Destination
    let size: CGFloat
    var body: some View {
        if let name = destination.siteLogoName {
            SiteLogo(name: name, size: size)
        } else {
            Image(systemName: destination.symbol).font(.system(size: size * 0.7, weight: .medium))
                .frame(width: size, height: size).accessibilityHidden(true)
        }
    }
}
