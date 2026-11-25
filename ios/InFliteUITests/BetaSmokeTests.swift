import XCTest

final class BetaSmokeTests: XCTestCase {
    @MainActor
    func testProductionSignInScreenLoads() {
        let app = XCUIApplication()
        app.launch()

        let entry = app.webViews.links["Sign in"]
        XCTAssertTrue(entry.waitForExistence(timeout: 30))
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
