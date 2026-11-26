import XCTest

final class BetaSmokeTests: XCTestCase {
    @MainActor
    func testSignedOutAppOffersNativeSignIn() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-signed-out"]
        app.launch()

        XCTAssertTrue(app.buttons["native-sign-in"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.webViews.firstMatch.exists)
    }

    @MainActor
    func testNativeTodayDockAndAppLibrary() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-native"]
        app.launch()

        let today = app.descendants(matching: .any).matching(identifier: "native-today").firstMatch
        XCTAssertTrue(today.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["dock-today"].exists)
        XCTAssertTrue(app.buttons["dock-weather"].exists)
        XCTAssertFalse(app.webViews.firstMatch.exists)

        app.buttons["dock-weather"].tap()
        let weather = app.descendants(matching: .any).matching(identifier: "native-weather").firstMatch
        XCTAssertTrue(weather.waitForExistence(timeout: 5))
        XCTAssertFalse(app.webViews.firstMatch.exists)
        app.buttons["dock-today"].tap()
        XCTAssertTrue(today.waitForExistence(timeout: 5))

        app.buttons["dock-apps"].tap()
        XCTAssertTrue(app.buttons["app-notes"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["app-calendar"].exists)
        XCTAssertFalse(app.webViews.firstMatch.exists)
    }

    @MainActor
    func testOpeningRecoversIntoWebViewAfterRetry() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-recovery"]
        app.launch()

        XCTAssertTrue(app.staticTexts["You’re offline"].waitForExistence(timeout: 10))
        app.buttons["retry-inflite"].tap()
        XCTAssertTrue(app.webViews.staticTexts["InFlite beta fixture"].waitForExistence(timeout: 15))
    }
}
