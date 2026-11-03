import XCTest
@testable import ReplywiseKeyboardCore

final class AccentMapTests: XCTestCase {
    private func accents(_ base: String, _ language: SupportedLanguage) -> [String] {
        AccentMap.alternatives(for: base, language: language)
    }

    func testFrenchAccentsFromTheSpec() {
        XCTAssertEqual(accents("e", .french).prefix(2), ["é", "è"])
        XCTAssertEqual(accents("a", .french).first, "à")
        XCTAssertEqual(accents("c", .french).first, "ç")
        XCTAssertEqual(accents("u", .french).first, "ù")
        XCTAssertTrue(accents("o", .french).contains("œ"))
        XCTAssertTrue(accents("i", .french).contains("î"))
    }

    func testGermanUmlautsAndSharpS() {
        XCTAssertEqual(accents("a", .german).first, "ä")
        XCTAssertEqual(accents("o", .german).first, "ö")
        XCTAssertEqual(accents("u", .german).first, "ü")
        XCTAssertEqual(accents("s", .german).first, "ß")
    }

    func testSpanishAccents() {
        for (base, accent) in [("a", "á"), ("e", "é"), ("i", "í"), ("o", "ó"), ("u", "ú")] {
            XCTAssertEqual(accents(base, .spanish).first, accent)
        }
        XCTAssertTrue(accents("u", .spanish).contains("ü"))
        // ñ has its own key; n's popup must not repeat it.
        XCTAssertFalse(accents("n", .spanish).contains("ñ"))
    }

    func testItalianGraveAccentsFirst() {
        for (base, accent) in [("a", "à"), ("e", "è"), ("i", "ì"), ("o", "ò"), ("u", "ù")] {
            XCTAssertEqual(accents(base, .italian).first, accent)
        }
        XCTAssertTrue(accents("e", .italian).contains("é"))
    }

    func testEnglishHasCommonAccentsForLoanWords() {
        XCTAssertTrue(accents("e", .englishUK).contains("é"))
        XCTAssertTrue(accents("n", .englishUK).contains("ñ"))
    }

    func testEveryVowelHasAccentsInEveryLanguage() {
        for language in SupportedLanguage.allCases {
            for vowel in ["a", "e", "i", "o", "u"] {
                XCTAssertFalse(accents(vowel, language).isEmpty, "\(language) \(vowel)")
            }
        }
    }

    func testNoDuplicatesAndNeverTheBaseItself() {
        for language in SupportedLanguage.allCases {
            let keys = KeyboardPage.allCases.flatMap {
                KeyboardLayouts.layout(language: language, page: $0, showsNextKeyboard: false).allKeys
            }
            for base in keys.compactMap(\.character) {
                let list = accents(base, language)
                XCTAssertEqual(list.count, Set(list).count, "\(language) \(base)")
                XCTAssertFalse(list.contains(base), "\(language) \(base)")
                for alternative in list {
                    XCTAssertEqual(alternative.count, 1, "\(language) \(base): \(alternative) is one character")
                }
            }
        }
    }

    func testPunctuationAlternatives() {
        XCTAssertEqual(accents("?", .spanish), ["¿"])
        XCTAssertEqual(accents("!", .spanish), ["¡"])
        XCTAssertEqual(accents("\"", .german).first, "„")
        XCTAssertEqual(accents("\"", .french).first, "«")
        XCTAssertEqual(accents("'", .french).first, "’")
        XCTAssertFalse(accents("€", .german).contains("€"))
        XCTAssertTrue(accents("q", .englishUK).isEmpty)
        XCTAssertFalse(AccentMap.hasAlternatives("1", language: .englishUK))
    }

    func testPopupAlignmentKeepsPopupOnScreen() {
        XCTAssertEqual(AccentPopupAlignment.forKey(at: 0, rowCount: 10), .leading)
        XCTAssertEqual(AccentPopupAlignment.forKey(at: 4, rowCount: 10), .leading)
        XCTAssertEqual(AccentPopupAlignment.forKey(at: 5, rowCount: 10), .trailing)
        XCTAssertEqual(AccentPopupAlignment.forKey(at: 9, rowCount: 10), .trailing)
    }

    func testSelectionUnderTheFinger() {
        // Leading popup: cells start at the key's left edge.
        XCTAssertEqual(AccentSelection.index(touchX: 5, keyWidth: 36, cellWidth: 30, count: 4, alignment: .leading), 0)
        XCTAssertEqual(AccentSelection.index(touchX: 65, keyWidth: 36, cellWidth: 30, count: 4, alignment: .leading), 2)
        XCTAssertEqual(AccentSelection.index(touchX: 500, keyWidth: 36, cellWidth: 30, count: 4, alignment: .leading), 3)
        XCTAssertEqual(AccentSelection.index(touchX: -40, keyWidth: 36, cellWidth: 30, count: 4, alignment: .leading), 0)
        // Trailing popup: the last cell ends at the key's right edge.
        XCTAssertEqual(AccentSelection.popupOffsetX(keyWidth: 36, cellWidth: 30, count: 4, alignment: .trailing), -84)
        XCTAssertEqual(AccentSelection.index(touchX: 30, keyWidth: 36, cellWidth: 30, count: 4, alignment: .trailing), 3)
        XCTAssertEqual(AccentSelection.index(touchX: -80, keyWidth: 36, cellWidth: 30, count: 4, alignment: .trailing), 0)
        XCTAssertEqual(AccentSelection.index(touchX: 10, keyWidth: 36, cellWidth: 0, count: 4, alignment: .leading), 0)
    }
}
