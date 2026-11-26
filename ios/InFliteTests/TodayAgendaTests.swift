import Foundation
import XCTest
@testable import InFlite

final class TodayAgendaTests: XCTestCase {
    func testCalendarAndMailLinksResolveSpecificItems() throws {
        let calendarID = "0123456789abcdef0123456789abcdef"
        let calendar = try event(["app": "calendar", "href": "/calendar/#item=\(calendarID)"])
        let mail = try event(["app": "mail", "href": "https://email.inflite.ai/#thread=booking_12"])
        XCTAssertEqual(TodayAgendaDestination.resolve(calendar, waiting: false), .calendarEvent(calendarID))
        XCTAssertEqual(TodayAgendaDestination.resolve(mail, waiting: false), .mailThread("booking_12"))
    }

    func testWaitingChatsResolveGroupAndDirectConversations() throws {
        let direct = try event(["first": "Alex", "id": "friend-123"])
        let group = try event(["first": "Alex", "id": "group-123", "group": ["id": "group-123", "name": "Team"]])
        XCTAssertEqual(TodayAgendaDestination.resolve(direct, waiting: true), .chat("friend-123", group: false))
        XCTAssertEqual(TodayAgendaDestination.resolve(group, waiting: true), .chat("group-123", group: true))
        XCTAssertNil(TodayAgendaDestination.resolve(direct, waiting: false))
    }

    func testOnlyTrustedLinksResolveNativeDetails() throws {
        let urls = [
            "https://inflite.ai.example.test/mail/#thread=booking_12",
            "//email.inflite.ai/#thread=booking_12",
            "https://someone@email.inflite.ai/#thread=booking_12",
            "https://email.inflite.ai/foreign/#thread=booking_12",
            "/mail/#thread=booking_12%2Fother",
            "/mail/#thread=booking_12&other=value"
        ]
        for href in urls {
            let value = try event(["app": "mail", "href": href])
            XCTAssertEqual(TodayAgendaDestination.resolve(value, waiting: false), .app(.mail), href)
        }
        let radar = try event(["app": "weather", "href": "/weather/#radar"])
        XCTAssertEqual(TodayAgendaDestination.resolve(radar, waiting: false), .weatherRadar)
        let mismatch = try event(["app": "weather", "href": "/mail/#thread=booking_12"])
        XCTAssertEqual(TodayAgendaDestination.resolve(mismatch, waiting: false), .app(.weather))
    }

    func testReminderStateChangeUsesExistingVersionAndAnOperationID() throws {
        let json = #"{"id":"0123456789abcdef0123456789abcdef","version":3,"title":"Call home","status":"open"}"#
        let reminder = try JSONDecoder().decode(NativeReminder.self, from: Data(json.utf8))
        let change = try NativeReminderChange(record: reminder, status: "done")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: change.body) as? [String: Any])
        XCTAssertEqual(body["version"] as? Int, 3)
        XCTAssertEqual(body["status"] as? String, "done")
        XCTAssertEqual(body["id"] as? String, reminder.id)
        XCTAssertEqual((body["operationId"] as? String)?.count, 32)
        XCTAssertEqual(Set(body.keys), Set(["version", "status", "id", "operationId"]))
    }

    private func event(_ fields: [String: Any]) throws -> BackendTodayEvent {
        try JSONDecoder().decode(BackendTodayEvent.self, from: JSONSerialization.data(withJSONObject: fields))
    }
}
