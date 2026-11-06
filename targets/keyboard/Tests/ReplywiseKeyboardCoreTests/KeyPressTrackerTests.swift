import XCTest
@testable import ReplywiseKeyboardCore

/// Rolling typing (code review #2). "commit" = what the controller inserts.
final class KeyPressTrackerTests: XCTestCase {
    private let a = KeyAction.character("a")
    private let b = KeyAction.character("b")
    private let apostrophe = KeyAction.character("'")
    private let five = KeyAction.character("5")

    func testSingleKeyCommitsOnRelease() {
        var tracker = KeyPressTracker()
        XCTAssertNil(tracker.keyDown(a))
        XCTAssertTrue(tracker.keyUp(a))
        XCTAssertFalse(tracker.isKeyPending)
    }

    func testOverlappingKeysKeepTheirOrder() {
        var tracker = KeyPressTracker()
        XCTAssertNil(tracker.keyDown(a))
        XCTAssertEqual(tracker.keyDown(b), a)   // a committed now
        XCTAssertTrue(tracker.keyUp(b))         // b released first: committed
        XCTAssertFalse(tracker.keyUp(a))        // a was already committed
        XCTAssertEqual(tracker, KeyPressTracker())
    }

    func testSpaceAndReturnTakePartInRolling() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(.space)
        XCTAssertEqual(tracker.keyDown(a), .space)
        XCTAssertFalse(tracker.keyUp(.space))
        XCTAssertTrue(tracker.keyUp(a))
    }

    func testNonInsertingKeysCommitTheHeldKeyButAreNotPending() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(a)
        XCTAssertEqual(tracker.keyDown(.shift), a)
        XCTAssertFalse(tracker.isKeyPending)
        XCTAssertFalse(tracker.keyUp(.shift))
        XCTAssertFalse(tracker.keyUp(a))
    }

    /// Numbers page: ' down, 5 down → ' committed while 5 is held (no page switch allowed then),
    /// 5 released → committed. Nothing phantom afterwards.
    func testNoPhantomKeyAcrossAPageChange() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(apostrophe)
        XCTAssertEqual(tracker.keyDown(five), apostrophe)
        XCTAssertTrue(tracker.isKeyPending)   // controller must not auto-switch now
        // Suppose the page changes anyway (page key, field change): the held key is handed back
        // to be committed on its own page, and nothing stale survives.
        XCTAssertEqual(tracker.pageWillChange(), five)
        XCTAssertEqual(tracker, KeyPressTracker())
        // Releases of keys whose views went away do nothing.
        XCTAssertFalse(tracker.keyUp(five))
        XCTAssertFalse(tracker.keyUp(apostrophe))
        // The next key is typed normally, with no phantom before it.
        XCTAssertNil(tracker.keyDown(a))
        XCTAssertTrue(tracker.keyUp(a))
    }

    func testStaleEarlyCommitNeverSwallowsALaterPress() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(a)
        _ = tracker.keyDown(b)          // a committed early; a's release never arrives
        XCTAssertTrue(tracker.keyUp(b))
        XCTAssertNil(tracker.keyDown(a)) // a pressed again later
        XCTAssertTrue(tracker.keyUp(a))  // and typed
    }

    func testCancelInsertsNothing() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(a)
        tracker.keyCancelled(a)
        XCTAssertFalse(tracker.keyUp(a))
        XCTAssertNil(tracker.keyDown(b))
    }

    func testPopupOnlyForTheStillPendingKey() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(a)
        XCTAssertTrue(tracker.shouldShowAlternatives(for: a))
        // While a's popup is open, another key doesn't commit a.
        XCTAssertNil(tracker.keyDown(b))
        XCTAssertTrue(tracker.keyUp(b))

        var rolled = KeyPressTracker()
        _ = rolled.keyDown(a)
        _ = rolled.keyDown(b)          // a committed early
        XCTAssertFalse(rolled.shouldShowAlternatives(for: a))
    }

    func testResetForgetsEverything() {
        var tracker = KeyPressTracker()
        _ = tracker.keyDown(a)
        _ = tracker.keyDown(b)
        tracker.reset()
        XCTAssertEqual(tracker, KeyPressTracker())
    }
}
