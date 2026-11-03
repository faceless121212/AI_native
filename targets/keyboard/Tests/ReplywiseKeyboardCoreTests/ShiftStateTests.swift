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

    func testUppercaseFlag() {
        XCTAssertFalse(ShiftState.off.isUppercase)
        XCTAssertTrue(ShiftState.on.isUppercase)
        XCTAssertTrue(ShiftState.capsLock.isUppercase)
    }
}
