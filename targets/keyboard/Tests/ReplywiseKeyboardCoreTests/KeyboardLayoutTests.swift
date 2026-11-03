import XCTest
@testable import ReplywiseKeyboardCore

final class KeyboardLayoutTests: XCTestCase {
    private func letters(_ language: SupportedLanguage) -> [String] {
        KeyboardLayouts.layout(language: language, page: .letters, showsNextKeyboard: false)
            .allKeys.compactMap(\.character)
    }

    private func row(_ language: SupportedLanguage, _ index: Int, page: KeyboardPage = .letters) -> [String] {
        KeyboardLayouts.layout(language: language, page: page, showsNextKeyboard: false)
            .rows[index].compactMap(\.character)
    }

    func testEnglishIsQwerty() {
        XCTAssertEqual(row(.englishUK, 0).joined(), "qwertyuiop")
        XCTAssertEqual(row(.englishUK, 1).joined(), "asdfghjkl")
        XCTAssertEqual(row(.englishUK, 2).joined(), "zxcvbnm")
    }

    func testItalianIsQwerty() {
        XCTAssertEqual(row(.italian, 0).joined(), "qwertyuiop")
        XCTAssertEqual(row(.italian, 2).joined(), "zxcvbnm")
    }

    func testSpanishIsQwertyWithEnye() {
        XCTAssertEqual(row(.spanish, 0).joined(), "qwertyuiop")
        XCTAssertEqual(row(.spanish, 1).joined(), "asdfghjklñ")
    }

    func testGermanIsQwertzWithUmlauts() {
        XCTAssertEqual(row(.german, 0).joined(), "qwertzuiopü")
        XCTAssertEqual(row(.german, 1).joined(), "asdfghjklöä")
        XCTAssertEqual(row(.german, 2).joined(), "yxcvbnm")
        // ß is on long-press of s, like the system German keyboard.
        XCTAssertFalse(letters(.german).contains("ß"))
        XCTAssertEqual(AccentMap.alternatives(for: "s", language: .german).first, "ß")
    }

    func testFrenchIsAzerty() {
        XCTAssertEqual(row(.french, 0).joined(), "azertyuiop")
        XCTAssertEqual(row(.french, 1).joined(), "qsdfghjklm")
        XCTAssertEqual(row(.french, 2), ["w", "x", "c", "v", "b", "n", "'"])
    }

    func testEveryLanguageHasAllBasicLatinLetters() {
        let alphabet = "abcdefghijklmnopqrstuvwxyz".map(String.init)
        for language in SupportedLanguage.allCases {
            let keys = Set(letters(language))
            for letter in alphabet {
                XCTAssertTrue(keys.contains(letter), "\(language) is missing \(letter)")
            }
        }
    }

    func testLetterRowsHaveShiftDeleteAndBottomRow() {
        for language in SupportedLanguage.allCases {
            let layout = KeyboardLayouts.layout(language: language, page: .letters, showsNextKeyboard: false)
            XCTAssertEqual(layout.rows.count, 4, "\(language)")
            XCTAssertEqual(layout.rows[2].first?.action, .shift)
            XCTAssertEqual(layout.rows[2].last?.action, .delete)
            XCTAssertEqual(layout.rows[3].map(\.action), [.switchPage(.numbers), .space, .returnKey])
        }
    }

    func testNextKeyboardKeyOnlyWhenNeeded() {
        let with = KeyboardLayouts.layout(language: .german, page: .letters, showsNextKeyboard: true)
        XCTAssertEqual(with.rows[3].map(\.action), [.switchPage(.numbers), .nextKeyboard, .space, .returnKey])
        let numbers = KeyboardLayouts.layout(language: .german, page: .numbers, showsNextKeyboard: true)
        XCTAssertEqual(numbers.rows[3].map(\.action), [.switchPage(.letters), .nextKeyboard, .space, .returnKey])
    }

    func testNumbersPage() {
        XCTAssertEqual(row(.englishUK, 0, page: .numbers).joined(), "1234567890")
        XCTAssertTrue(row(.englishUK, 1, page: .numbers).contains("£"))
        for language in [SupportedLanguage.german, .french, .spanish, .italian] {
            XCTAssertTrue(row(language, 1, page: .numbers).contains("€"), "\(language)")
            XCTAssertTrue(row(language, 1, page: .symbols).contains("£"), "\(language)")
        }
        XCTAssertTrue(row(.englishUK, 1, page: .symbols).contains("€"))
        let numbers = KeyboardLayouts.layout(language: .englishUK, page: .numbers, showsNextKeyboard: false)
        XCTAssertEqual(numbers.rows[2].first?.action, .switchPage(.symbols))
        XCTAssertEqual(numbers.rows[2].last?.action, .delete)
        XCTAssertEqual(row(.englishUK, 2, page: .numbers), [".", ",", "?", "!", "'"])
    }

    func testSymbolsPage() {
        let symbols = KeyboardLayouts.layout(language: .englishUK, page: .symbols, showsNextKeyboard: false)
        XCTAssertEqual(symbols.rows[0].compactMap(\.character), ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="])
        XCTAssertEqual(symbols.rows[2].first?.action, .switchPage(.numbers))
        XCTAssertEqual(symbols.rows[3].first?.action, .switchPage(.letters))
    }

    func testKeyIDsAreUniqueOnEveryPage() {
        for language in SupportedLanguage.allCases {
            for page in KeyboardPage.allCases {
                for globe in [false, true] {
                    let ids = KeyboardLayouts.layout(language: language, page: page, showsNextKeyboard: globe)
                        .allKeys.map(\.id)
                    XCTAssertEqual(ids.count, Set(ids).count, "\(language) \(page)")
                }
            }
        }
    }

    func testRowsFitTheWidestRow() {
        for language in SupportedLanguage.allCases {
            for page in KeyboardPage.allCases {
                let layout = KeyboardLayouts.layout(language: language, page: page, showsNextKeyboard: true)
                for row in layout.rows {
                    XCTAssertLessThanOrEqual(KeyboardLayout.fixedUnits(of: row), layout.maxRowUnits)
                }
                // The space bar keeps at least three key widths, even with the globe key.
                let bottom = layout.rows[3]
                XCTAssertGreaterThanOrEqual(layout.maxRowUnits - KeyboardLayout.fixedUnits(of: bottom), 3)
            }
        }
        let german = KeyboardLayouts.layout(language: .german, page: .letters, showsNextKeyboard: false)
        XCTAssertEqual(german.maxRowUnits, 11)
        let english = KeyboardLayouts.layout(language: .englishUK, page: .letters, showsNextKeyboard: false)
        XCTAssertEqual(english.maxRowUnits, 10)
    }

    func testPageKeyLabels() {
        XCTAssertEqual(KeyboardLayouts.pageKeyLabel(.numbers), "123")
        XCTAssertEqual(KeyboardLayouts.pageKeyLabel(.letters), "ABC")
        XCTAssertEqual(KeyboardLayouts.pageKeyLabel(.symbols), "#+=")
    }

    func testBackToLettersAfterSpaceOrApostrophe() {
        XCTAssertEqual(KeyboardLayouts.pageAfterInserting(" ", on: .numbers), .letters)
        XCTAssertEqual(KeyboardLayouts.pageAfterInserting("'", on: .symbols), .letters)
        XCTAssertEqual(KeyboardLayouts.pageAfterInserting("5", on: .numbers), .numbers)
        XCTAssertEqual(KeyboardLayouts.pageAfterInserting("a", on: .letters), .letters)
    }

    func testKeyCase() {
        XCTAssertEqual(KeyCase.apply("a", shifted: true), "A")
        XCTAssertEqual(KeyCase.apply("ñ", shifted: true), "Ñ")
        XCTAssertEqual(KeyCase.apply("é", shifted: true), "É")
        XCTAssertEqual(KeyCase.apply("ü", shifted: true), "Ü")
        XCTAssertEqual(KeyCase.apply("ß", shifted: true), "ß")
        XCTAssertEqual(KeyCase.apply("'", shifted: true), "'")
        XCTAssertEqual(KeyCase.apply("A", shifted: false), "A")
    }
}
