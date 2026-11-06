import XCTest
@testable import ReplywiseKeyboardCore

/// Checks the strings generated from locales/<lang>/keyboard.json (Strings.generated.swift).
final class KeyboardStringsTests: XCTestCase {
    func testEveryLanguageHasItsOwnInstance() {
        for language in SupportedLanguage.allCases {
            XCTAssertEqual(KeyboardStrings.forLanguage(language).language, language)
        }
    }

    func testEnglishSourceCopy() {
        let en = KeyboardStrings.en
        XCTAssertEqual(en.appName, "Replywise")
        XCTAssertEqual(en.aiSuggestion, "AI suggestion")
        XCTAssertEqual(en.barOffline, "No connection. AI replies need the internet.")
    }

    func testNoStringIsEmpty() {
        for language in SupportedLanguage.allCases {
            let strings = KeyboardStrings.forLanguage(language)
            for value in [strings.appName, strings.nextKeyboard, strings.aiSuggestion, strings.actionsReply,
                          strings.barNoFullAccess, strings.barAiOff, strings.toneWarm, strings.formalityFormal] {
                XCTAssertFalse(value.trimmingCharacters(in: .whitespaces).isEmpty, "\(language)")
            }
        }
    }

    func testKeyLabelsAreSetInEveryLanguage() {
        for language in SupportedLanguage.allCases {
            let s = KeyboardStrings.forLanguage(language)
            for value in [s.keysShift, s.keysCapsLock, s.keysDelete, s.keysSpace, s.keysNumbers,
                          s.keysLetters, s.keysMoreSymbols, s.keysShiftOn, s.keysShiftOff, s.nextKeyboard] {
                XCTAssertFalse(value.trimmingCharacters(in: .whitespaces).isEmpty, "\(language)")
            }
        }
        XCTAssertEqual(KeyboardStrings.en.keysSpace, "space")
        XCTAssertEqual(KeyboardStrings.en.keysCapsLock, "Caps lock")
    }

    func testPlaceholdersAreFilled() {
        for language in SupportedLanguage.allCases {
            let strings = KeyboardStrings.forLanguage(language)
            let trial = strings.barLastTrialDay(price: "€4.99")
            XCTAssertTrue(trial.contains("€4.99"), "\(language)")
            XCTAssertFalse(trial.contains("{{"), "\(language)")
            XCTAssertTrue(strings.counterLeftToday(count: 3).contains("3"), "\(language)")
        }
    }

    func testPluralCategories() {
        XCTAssertTrue(SupportedLanguage.englishUK.isPluralOne(1))
        XCTAssertFalse(SupportedLanguage.englishUK.isPluralOne(0))
        XCTAssertTrue(SupportedLanguage.french.isPluralOne(0))
        XCTAssertTrue(SupportedLanguage.french.isPluralOne(1))
        XCTAssertFalse(SupportedLanguage.german.isPluralOne(2))
    }
}
