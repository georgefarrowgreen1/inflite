import XCTest

final class BetaSmokeTests: XCTestCase {
    @MainActor
    func testSignedOutAppOffersNativeSignIn() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-signed-out"]
        app.launch()

        XCTAssertTrue(app.buttons["native-sign-in"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.webViews.firstMatch.exists)
        app.buttons["native-sign-in"].tap()
        XCTAssertTrue(app.textFields["native-auth-email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["native-auth-password"].exists)
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

        let appLauncher = app.buttons["dock-apps"]
        appLauncher.tap()
        let notes = app.buttons["app-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["app-calendar"].exists)
        XCTAssertFalse(app.webViews.firstMatch.exists)

        notes.tap()
        let notesIsActive = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "Notes"), object: appLauncher
        )
        XCTAssertEqual(XCTWaiter.wait(for: [notesIsActive], timeout: 5), .completed)
    }

    @MainActor
    func testDockKeepsTodayAndAppsAvailableAtTheLargestTextSize() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-native", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ]
        app.launch()

        let today = app.buttons["dock-today"]
        let appLauncher = app.buttons["dock-apps"]
        XCTAssertTrue(today.waitForExistence(timeout: 10))
        XCTAssertTrue(today.isHittable)
        XCTAssertTrue(appLauncher.isHittable)
        XCTAssertFalse(app.buttons["dock-weather"].exists)

        appLauncher.tap()
        XCTAssertTrue(app.navigationBars["Your apps"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testQuickCaptureFocusesAndRetainsAnUnfinishedNoteAcrossLaunches() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-native"]
        app.launch()

        let openCapture = app.buttons["Quick Capture"]
        let editor = app.descendants(matching: .any).matching(identifier: "capture-note-editor").firstMatch
        let close = app.buttons["capture-close"]
        let note = "Capture draft \(UUID().uuidString.prefix(8))"

        XCTAssertTrue(openCapture.waitForExistence(timeout: 10))
        openCapture.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        // Typing without tapping the editor exercises its automatic focus.
        // A simulator with a hardware keyboard may not show an onscreen keyboard.
        _ = app.keyboards.firstMatch.waitForExistence(timeout: 2)
        editor.typeText(note)
        let draft = try XCTUnwrap(editor.value as? String)
        XCTAssertTrue(draft.hasSuffix(note))
        XCTAssertTrue(app.buttons["capture-save"].isHittable)
        close.tap()
        let sheetClosed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: editor
        )
        XCTAssertEqual(XCTWaiter.wait(for: [sheetClosed], timeout: 5), .completed)

        app.terminate()
        app.launch()

        XCTAssertTrue(openCapture.waitForExistence(timeout: 10))
        openCapture.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, draft)
        _ = app.keyboards.firstMatch.waitForExistence(timeout: 2)
        editor.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: note.count))
        close.tap()
    }

    @MainActor
    func testCachedTodayIsReadOnlyUntilAccountVerification() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-cached-today"]
        app.launch()

        let summary = app.descendants(matching: .any).matching(identifier: "cached-today-preview").firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Sample day summary"].exists)
        XCTAssertFalse(app.buttons["dock-apps"].exists)
        XCTAssertFalse(app.buttons["Quick Capture"].exists)

        app.buttons["Try again"].tap()
        XCTAssertTrue(app.buttons["native-sign-in"].waitForExistence(timeout: 5))
        XCTAssertFalse(summary.exists)
    }

    @MainActor
    func testOpeningRecoversIntoNativeWelcomeAfterRetry() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-recovery"]
        app.launch()

        let retry = app.buttons["Try again"]
        XCTAssertTrue(retry.waitForExistence(timeout: 10))
        retry.tap()
        XCTAssertTrue(app.buttons["native-sign-in"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.webViews.firstMatch.exists)
    }
}
