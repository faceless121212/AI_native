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
    private func period(_ context: String?, previousSpace: Bool = true, kind: TextFieldKind = .text) -> Bool {
        DoubleSpacePeriod.shouldInsertPeriod(contextBefore: context, previousKeyWasSpace: previousSpace, fieldKind: kind)
    }

    func testAfterAWordAndOneSpace() {
        XCTAssertTrue(period("See you "))
        XCTAssertTrue(period("Ciao 2 "))
        XCTAssertTrue(period("Schön "))
        XCTAssertTrue(period("(ok) "))
        XCTAssertTrue(period("“ok” "))
    }

    func testNeedsTheSpaceKeyJustBefore() {
        XCTAssertFalse(period("See you ", previousSpace: false))
    }

    func testNotAfterPunctuationOrSecondSpace() {
        XCTAssertFalse(period("See you. "))
        XCTAssertFalse(period("See you, "))
        XCTAssertFalse(period("See you  "))
        XCTAssertFalse(period(" "))
        XCTAssertFalse(period(""))
        XCTAssertFalse(period(nil))
        XCTAssertFalse(period("See you"))
    }

    func testOffInAddressEmailSearchAndNumberFields() {
        for kind in [TextFieldKind.url, .email, .webSearch, .numeric] {
            XCTAssertFalse(period("example ", kind: kind), "\(kind)")
            XCTAssertFalse(DoubleSpacePeriod.isEnabled(for: kind))
        }
        XCTAssertTrue(DoubleSpacePeriod.isEnabled(for: .text))
    }
}
