import XCTest
@testable import ReplywiseKeyboardCore

final class AutoCapitalizationTests: XCTestCase {
    private func sentences(_ context: String?) -> Bool {
        AutoCapitalization.shouldCapitalize(mode: .sentences, contextBefore: context)
    }

    func testFieldStart() {
        XCTAssertTrue(sentences(nil))
        XCTAssertTrue(sentences(""))
        XCTAssertTrue(sentences("   "))
    }

    func testAfterSentenceEndAndSpace() {
        XCTAssertTrue(sentences("Hi there. "))
        XCTAssertTrue(sentences("Really! "))
        XCTAssertTrue(sentences("Wie geht's? "))
        XCTAssertTrue(sentences("Well… "))
        XCTAssertTrue(sentences("Done.  "))
    }

    func testNotWithoutTheSpace() {
        XCTAssertFalse(sentences("Hi there."))
        XCTAssertFalse(sentences("3.5"))
    }

    func testNotMidSentence() {
        XCTAssertFalse(sentences("Hi there"))
        XCTAssertFalse(sentences("Hi there "))
        XCTAssertFalse(sentences("Yes, "))
        XCTAssertFalse(sentences("Bonjour : "))
    }

    func testAfterLineBreak() {
        XCTAssertTrue(sentences("Hello\n"))
        XCTAssertTrue(sentences("Hello,\n"))
    }

    func testQuotesBracketsAndSpanishOpeners() {
        XCTAssertTrue(sentences("He said \"Stop.\" "))
        XCTAssertTrue(sentences("(Yes.) "))
        XCTAssertTrue(sentences("Hola. ¿"))
        XCTAssertTrue(sentences("¡"))
        XCTAssertTrue(sentences("« "))
        XCTAssertFalse(sentences("Hola ¿"))
    }

    func testRespectsTheHostsAutocapitalizationType() {
        XCTAssertFalse(AutoCapitalization.shouldCapitalize(mode: .none, contextBefore: nil))
        XCTAssertFalse(AutoCapitalization.shouldCapitalize(mode: .none, contextBefore: "Hi. "))
        XCTAssertTrue(AutoCapitalization.shouldCapitalize(mode: .allCharacters, contextBefore: "ABC"))
        XCTAssertTrue(AutoCapitalization.shouldCapitalize(mode: .words, contextBefore: nil))
        XCTAssertTrue(AutoCapitalization.shouldCapitalize(mode: .words, contextBefore: "Anna "))
        XCTAssertTrue(AutoCapitalization.shouldCapitalize(mode: .words, contextBefore: "Anna ("))
        XCTAssertFalse(AutoCapitalization.shouldCapitalize(mode: .words, contextBefore: "Ann"))
    }
}

final class DoubleSpacePeriodTests: XCTestCase {
    /// Simulates: the user typed `before`, tapped space (mark taken), the host now shows `now`,
    /// and space is tapped again.
    private func period(
        typed before: String?,
        now: String? = nil,
        previousSpace: Bool = true,
        kind: TextFieldKind = .text
    ) -> Bool {
        let mark = previousSpace ? SpaceMark(contextBeforeSpace: before) : nil
        let current = now ?? ((before ?? "") + " ")
        return DoubleSpacePeriod.shouldInsertPeriod(contextBefore: current, previousSpace: mark, fieldKind: kind)
    }

    func testAfterAWordAndOneSpace() {
        XCTAssertTrue(period(typed: "See you"))
        XCTAssertTrue(period(typed: "Ciao 2"))
        XCTAssertTrue(period(typed: "Schön"))
        XCTAssertTrue(period(typed: "(ok)"))
        XCTAssertTrue(period(typed: "“ok”"))
    }

    func testNeedsTheSpaceKeyJustBefore() {
        XCTAssertFalse(period(typed: "See you", previousSpace: false))
    }

    func testNotAfterPunctuationOrSecondSpace() {
        XCTAssertFalse(period(typed: "See you."))
        XCTAssertFalse(period(typed: "See you,"))
        XCTAssertFalse(period(typed: "See you "))
        XCTAssertFalse(period(typed: ""))
        XCTAssertFalse(period(typed: nil))
        XCTAssertFalse(DoubleSpacePeriod.shouldInsertPeriod(contextBefore: nil, previousSpace: SpaceMark(contextBeforeSpace: "Hi"), fieldKind: .text))
    }

    /// Code review #3: space, cursor moved elsewhere, space again → just a space.
    func testNotAfterTheCursorMoved() {
        // Cursor moved back into the middle of the text, right after another "word ".
        XCTAssertFalse(period(typed: "Hello world", now: "Hello "))
        // Cursor moved to the end of a different line that also ends in "you ".
        XCTAssertFalse(period(typed: "See you", now: "Thank you "))
        // Same tail but a different length (same words earlier in the text).
        XCTAssertFalse(period(typed: "ok ok", now: "ok ok ok ok "))
    }

    func testLongTextWhoseContextWindowSlides() {
        // Hosts may return only the last part of a long text; then only the tail is compared.
        let long = String(repeating: "word ", count: 40) + "end"
        let window = String((long + " ").suffix(120))
        XCTAssertTrue(period(typed: long, now: window))
    }

    func testOffInAddressEmailSearchAndNumberFields() {
        for kind in [TextFieldKind.url, .email, .webSearch, .numeric] {
            XCTAssertFalse(period(typed: "example", kind: kind), "\(kind)")
            XCTAssertFalse(DoubleSpacePeriod.isEnabled(for: kind))
        }
        XCTAssertTrue(DoubleSpacePeriod.isEnabled(for: .text))
    }
}
