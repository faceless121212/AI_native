import XCTest
@testable import ReplywiseKeyboardCore

final class DeleteRepeatTests: XCTestCase {
    func testRepeatStartsAfterHalfASecond() {
        XCTAssertEqual(DeleteRepeat.delay(beforeRepeat: 0), 0.5)
        XCTAssertEqual(DeleteRepeat.time(ofRepeat: 0), 0.5, accuracy: 0.0001)
    }

    func testAccelerates() {
        XCTAssertEqual(DeleteRepeat.delay(beforeRepeat: 1), 0.1)
        XCTAssertEqual(DeleteRepeat.delay(beforeRepeat: 9), 0.1)
        XCTAssertEqual(DeleteRepeat.delay(beforeRepeat: 10), 0.06)
        XCTAssertEqual(DeleteRepeat.delay(beforeRepeat: 100), 0.06)
        // Never slower later on.
        for index in 1..<50 {
            XCTAssertLessThanOrEqual(DeleteRepeat.delay(beforeRepeat: index), DeleteRepeat.delay(beforeRepeat: index - 1))
        }
    }

    func testWordsAfterAboutTwoSeconds() {
        XCTAssertEqual(DeleteRepeat.unit(forRepeat: 19), .character)
        XCTAssertEqual(DeleteRepeat.unit(forRepeat: 20), .word)
        XCTAssertEqual(DeleteRepeat.time(ofRepeat: 20), 2.06, accuracy: 0.001)
    }

    func testCharacterStepIsOneDelete() {
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .character, contextBefore: "Hello world"), 1)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .character, contextBefore: nil), 1)
    }

    func testWordStepCountsGraphemeClusters() {
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "Hello world"), 5)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "Hello world  "), 7)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "Grüße"), 5)
        // One emoji with skin tone and one family emoji are one deleteBackward each.
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "Hi 👍🏽👨‍👩‍👧"), 2)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "Ça va\nbien"), 4)
    }

    func testWordStepWithoutContextStillDeletes() {
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: nil), 1)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: ""), 1)
        XCTAssertEqual(DeleteRepeat.deleteCount(unit: .word, contextBefore: "   "), 3)
    }
}
