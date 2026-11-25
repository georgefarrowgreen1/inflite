import Foundation
import XCTest
@testable import InFlite

final class NavigationPolicyTests: XCTestCase {
    func testEveryRouteOpensTheCanonicalWebScreen() {
        let paths: [InFliteRoute: String] = [
            .today: "/", .weather: "/weather/", .markets: "/markets/",
            .fitness: "/fitness/", .mail: "/mail/", .chats: "/chats/",
            .calendar: "/calendar/", .notes: "/notes/", .people: "/people/",
            .status: "/status/", .account: "/settings/account/", .files: "/#files"
        ]
        XCTAssertEqual(Set(paths.keys), Set(InFliteRoute.allCases))
        for (route, path) in paths {
            XCTAssertEqual(route.url.absoluteString, "https://inflite.ai" + path)
            XCTAssertEqual(InFliteRoute(link: route.url), route)
            XCTAssertEqual(InFliteRoute(link: URL(string: "inflite://\(route.rawValue)")!), route)
        }
    }

    func testRejectsUnrecognizedOrParameterizedAppLinks() {
        for url in [
            "inflite://unknown", "inflite://weather:123", "inflite://weather/elsewhere",
            "inflite://weather?redirect=https://example.org", "inflite://name@weather",
            "inflite://weather#other", "https://example.org/weather/",
            "https://inflite.ai:8080/weather/", "https://inflite.ai/#signin",
            "https://inflite.ai/wildlife/"
        ] {
            XCTAssertNil(InFliteRoute(link: URL(string: url)!), url)
        }
    }

    func testCompanionSitesStayInTheWebSession() {
        for url in [
            "https://inflite.ai/weather/", "https://os.inflite.ai/",
            "https://auth.inflite.ai/go", "https://account.inflite.ai/",
            "https://email.inflite.ai/", "https://status.inflite.ai/",
            "https://chat.inflite.ai/", "https://weather.inflite.ai/",
            "https://fitness.inflite.ai/", "https://finance.inflite.ai/"
        ] {
            XCTAssertEqual(decision(url), .inside, url)
        }
    }

    func testUserLinksOpenExternallyAndRedirectsStayRestricted() {
        for url in ["https://example.org/", "mailto:hello@example.org", "tel:+441234567890"] {
            XCTAssertEqual(decision(url, tapped: true), .system, url)
            XCTAssertEqual(decision(url), .block, url)
            XCTAssertEqual(decision(url, tapped: true, trusted: false), .block, url)
        }
        for url in [
            "http://inflite.ai/", "https://inflite.ai.example.org/",
            "https://inflite.ai:8443/", "https://inflite.ai@example.org/",
            "https://other@inflite.ai/", "file:///private/", "javascript:alert(1)"
        ] {
            XCTAssertFalse(NavigationPolicy.owns(URL(string: url)!), url)
            XCTAssertEqual(decision(url), .block, url)
        }
        XCTAssertEqual(decision("https://inflite.ai:443/"), .inside)
    }

    func testFramesAndDownloadsRespectTheirNavigationBoundaries() {
        XCTAssertEqual(decision("about:srcdoc", mainFrame: false), .inside)
        XCTAssertEqual(decision("data:text/html,Message", mainFrame: false), .inside)
        XCTAssertEqual(decision("data:text/html,Message"), .block)
        XCTAssertEqual(decision("https://example.org/", mainFrame: false), .inside)
        XCTAssertTrue(NavigationPolicy.canDownload(URL(string: "blob:https://inflite.ai/file")!))
        XCTAssertTrue(NavigationPolicy.canDownload(URL(string: "https://email.inflite.ai/download")!))
        XCTAssertFalse(NavigationPolicy.canDownload(URL(string: "blob:https://example.org/file")!))
    }

    private func decision(
        _ url: String, mainFrame: Bool = true, tapped: Bool = false, trusted: Bool = true
    ) -> NavigationPolicy.Decision {
        NavigationPolicy.decide(
            URL(string: url)!, topLevel: mainFrame, userFollowedLink: tapped, trustedSource: trusted
        )
    }
}
