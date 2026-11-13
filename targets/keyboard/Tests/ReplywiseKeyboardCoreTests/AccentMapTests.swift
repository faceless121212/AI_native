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

    func testPopupStartsOnTheBaseCharacter() {
        let leading = AccentPopupLayout.items(base: "e", alternatives: ["é", "è", "ê"], alignment: .leading)
        XCTAssertEqual(leading, ["e", "é", "è", "ê"])
        XCTAssertEqual(AccentPopupLayout.baseIndex(count: leading.count, alignment: .leading), 0)
        let trailing = AccentPopupLayout.items(base: "o", alternatives: ["ó", "ò"], alignment: .trailing)
        XCTAssertEqual(trailing, ["ò", "ó", "o"])
        XCTAssertEqual(AccentPopupLayout.baseIndex(count: trailing.count, alignment: .trailing), 2)
        // Never twice.
        XCTAssertEqual(AccentPopupLayout.items(base: "a", alternatives: ["a", "à"], alignment: .leading), ["a", "à"])
    }

    /// Code review #1: holding any key with a popup and lifting without sliding types the key itself.
    func testBaseLetterIsAlwaysReachable() {
        for language in SupportedLanguage.allCases {
            for page in KeyboardPage.allCases {
                let layout = KeyboardLayouts.layout(language: language, page: page, showsNextKeyboard: false)
                for row in layout.rows {
                    for (index, key) in row.enumerated() {
                        guard let base = key.character else { continue }
                        let alternatives = AccentMap.alternatives(for: base, language: language)
                        guard !alternatives.isEmpty else { continue }
                        let alignment = AccentPopupAlignment.forKey(at: index, rowCount: row.count)
                        let items = AccentPopupLayout.items(base: base, alternatives: alternatives, alignment: alignment)
                        let selection = AccentPopupLayout.selection(
                            dx: 0, dy: 0, cellWidth: 32, rowHeight: 54, count: items.count, alignment: alignment
                        )
                        XCTAssertEqual(selection.map { items[$0] }, base, "\(language) \(page) \(base)")
                        // A small wobble stays on the base.
                        let wobble = AccentPopupLayout.selection(
                            dx: 10, dy: -8, cellWidth: 32, rowHeight: 54, count: items.count, alignment: alignment
                        )
                        let expectedWobble = alignment == .leading ? 0 : items.count - 1
                        XCTAssertEqual(wobble, expectedWobble, "\(language) \(base)")
                    }
                }
            }
        }
    }

    func testSlidingPicksAccentsAwayFromTheEdge() {
        // Leading: slide right.
        XCTAssertEqual(AccentPopupLayout.selection(dx: 32, dy: -20, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading), 1)
        XCTAssertEqual(AccentPopupLayout.selection(dx: 100, dy: -20, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading), 3)
        // Half a cell past the last one still selects it.
        XCTAssertEqual(AccentPopupLayout.selection(dx: 4 * 32 - 10, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading), 3)
        // Trailing: slide left.
        XCTAssertEqual(AccentPopupLayout.selection(dx: -32, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .trailing), 2)
        XCTAssertEqual(AccentPopupLayout.selection(dx: -96, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .trailing), 0)
    }

    func testLeavingThePopupCancels() {
        // Far past the ends.
        XCTAssertNil(AccentPopupLayout.selection(dx: 7 * 32, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading))
        XCTAssertNil(AccentPopupLayout.selection(dx: -2 * 32, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading))
        XCTAssertNil(AccentPopupLayout.selection(dx: 2 * 32, dy: 0, cellWidth: 32, rowHeight: 54, count: 4, alignment: .trailing))
        // Too far up or below the key.
        XCTAssertNil(AccentPopupLayout.selection(dx: 0, dy: -120, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading))
        XCTAssertNil(AccentPopupLayout.selection(dx: 0, dy: 60, cellWidth: 32, rowHeight: 54, count: 4, alignment: .leading))
        XCTAssertNil(AccentPopupLayout.selection(dx: 0, dy: 0, cellWidth: 0, rowHeight: 54, count: 4, alignment: .leading))
    }

    func testBaseCellIsCentredOnTheKey() {
        XCTAssertEqual(AccentPopupLayout.offsetX(keyWidth: 36, cellWidth: 30, count: 4, alignment: .leading), 3)
        // Trailing: the last (base) cell is over the key, the others extend to the left.
        XCTAssertEqual(AccentPopupLayout.offsetX(keyWidth: 36, cellWidth: 30, count: 4, alignment: .trailing), 3 - 90)
    }
}
