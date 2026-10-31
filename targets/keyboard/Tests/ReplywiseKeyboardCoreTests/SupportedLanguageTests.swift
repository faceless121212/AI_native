import XCTest
@testable import ReplywiseKeyboardCore

final class SupportedLanguageTests: XCTestCase {
    func testTagsMatchV1Markets() {
        XCTAssertEqual(SupportedLanguage.allCases.map(\.rawValue), ["en-GB", "de", "fr", "es", "it"])
    }

    func testFallbackIsEnglishUK() {
        XCTAssertEqual(SupportedLanguage.fallback, .englishUK)
    }

    func testExactTags() {
        for language in SupportedLanguage.allCases {
            XCTAssertEqual(SupportedLanguage.from(languageTag: language.rawValue), language)
        }
    }

    func testRegionalVariantsCaseAndUnderscore() {
        XCTAssertEqual(SupportedLanguage.from(languageTag: "de-AT"), .german)
        XCTAssertEqual(SupportedLanguage.from(languageTag: "fr_CH"), .french)
        XCTAssertEqual(SupportedLanguage.from(languageTag: "ES-mx"), .spanish)
        XCTAssertEqual(SupportedLanguage.from(languageTag: " it "), .italian)
        XCTAssertEqual(SupportedLanguage.from(languageTag: "en-US"), .englishUK)
    }

    func testUnsupportedTags() {
        XCTAssertNil(SupportedLanguage.from(languageTag: "pt-BR"))
        XCTAssertNil(SupportedLanguage.from(languageTag: ""))
        XCTAssertNil(SupportedLanguage.from(languageTag: "-"))
        XCTAssertNil(SupportedLanguage.from(languageTag: "english"))
    }
}
