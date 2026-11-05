import XCTest
@testable import ReplywiseKeyboardCore

final class ShiftStateTests: XCTestCase {
    func testSingleTapIsOneShot() {
        var shift = ShiftStateMachine()
        shift.tapShift(at: 10)
        XCTAssertEqual(shift.state, .on)
        shift.didInsertCharacter()
        XCTAssertEqual(shift.state, .off)
    }

    func testSlowSecondTapTurnsShiftOff() {
        var shift = ShiftStateMachine()
        shift.tapShift(at: 10)
        shift.tapShift(at: 10.5)
        XCTAssertEqual(shift.state, .off)
    }

    func testDoubleTapIsCapsLock() {
        var shift = ShiftStateMachine()
        shift.tapShift(at: 10)
        shift.tapShift(at: 10.2)
        XCTAssertEqual(shift.state, .capsLock)
        shift.didInsertCharacter()
        shift.didInsertCharacter()
        XCTAssertEqual(shift.state, .capsLock)
        shift.tapShift(at: 12)
        XCTAssertEqual(shift.state, .off)
    }

    func testDoubleTapWhileAutocapitalisedIsCapsLock() {
        var shift = ShiftStateMachine()
        shift.applyAutocapitalization(true)
        XCTAssertEqual(shift.state, .on)
        shift.tapShift(at: 5)
        XCTAssertEqual(shift.state, .off)
        shift.tapShift(at: 5.2)
        XCTAssertEqual(shift.state, .capsLock)
    }

    func testTapRightAfterLeavingCapsLockIsNotCapsLockAgain() {
        var shift = ShiftStateMachine(state: .capsLock)
        shift.tapShift(at: 1)
        XCTAssertEqual(shift.state, .off)
        shift.tapShift(at: 1.1)
        XCTAssertEqual(shift.state, .on)
    }

    func testTypingBetweenTapsResetsTheDoubleTap() {
        var shift = ShiftStateMachine()
        shift.tapShift(at: 1)
        shift.didInsertCharacter()
        shift.tapShift(at: 1.2)
        XCTAssertEqual(shift.state, .on)
    }

    func testAutocapitalisationNeverTouchesCapsLock() {
        var shift = ShiftStateMachine(state: .capsLock)
        shift.applyAutocapitalization(false)
        XCTAssertEqual(shift.state, .capsLock)
        var plain = ShiftStateMachine()
        plain.applyAutocapitalization(true)
        XCTAssertEqual(plain.state, .on)
        plain.applyAutocapitalization(false)
        XCTAssertEqual(plain.state, .off)
    }

    func testClockGoingBackwardsIsNotADoubleTap() {
        var shift = ShiftStateMachine()
        shift.tapShift(at: 10)
        shift.tapShift(at: 9.9)
        XCTAssertEqual(shift.state, .off)
    }

    /// Accessibility audit #9: VoiceOver / Switch Control get a wider double-tap window.
    func testWiderWindowForAssistiveTechnology() {
        XCTAssertEqual(ShiftStateMachine.window(assistiveTechnologyRunning: false), ShiftStateMachine.doubleTapWindow)
        let wide = ShiftStateMachine.window(assistiveTechnologyRunning: true)
        XCTAssertGreaterThan(wide, ShiftStateMachine.doubleTapWindow)

        var normal = ShiftStateMachine()
        normal.tapShift(at: 1)
        normal.tapShift(at: 1.8)
        XCTAssertEqual(normal.state, .off)

        var assisted = ShiftStateMachine()
        assisted.tapShift(at: 1, window: wide)
        assisted.tapShift(at: 1.8, window: wide)
        XCTAssertEqual(assisted.state, .capsLock)
    }

    func testCapsLockActionSetsAndClearsDirectly() {
        var shift = ShiftStateMachine()
        shift.setCapsLock(true)
        XCTAssertEqual(shift.state, .capsLock)
        shift.didInsertCharacter()
        XCTAssertEqual(shift.state, .capsLock)
        shift.setCapsLock(false)
        XCTAssertEqual(shift.state, .off)
        // A tap right after the action is a plain tap, not a double tap.
        shift.tapShift(at: 3)
        XCTAssertEqual(shift.state, .on)
    }

    func testShiftAccessibilityValue() {
        let en = KeyboardStrings.en
        XCTAssertEqual(ShiftState.off.accessibilityValue(en), "off")
        XCTAssertEqual(ShiftState.on.accessibilityValue(en), "on")
        XCTAssertEqual(ShiftState.capsLock.accessibilityValue(en), "Caps lock")
    }

    func testUppercaseFlag() {
        XCTAssertFalse(ShiftState.off.isUppercase)
        XCTAssertTrue(ShiftState.on.isUppercase)
        XCTAssertTrue(ShiftState.capsLock.isUppercase)
    }
}
