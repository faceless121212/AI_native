import XCTest
@testable import ReplywiseKeyboardCore

final class AppGroupContractTests: XCTestCase {
    func testKeysMatchArchitectureSection5() {
        XCTAssertEqual(AppGroupKey.allCases.map(\.rawValue).sorted(), [
            "v1.aiEnabled", "v1.defaults", "v1.keyboardHeartbeat", "v1.lastChips",
            "v1.providerDown", "v1.quota", "v1.trialEndsAt", "v1.uiLang",
        ])
    }

    func testHeartbeatJSON() throws {
        let date = Date(timeIntervalSince1970: 1_762_164_900.25)
        let heartbeat = KeyboardHeartbeat(date: date, hasFullAccess: true, version: "0.1.0 (1)")
        XCTAssertEqual(heartbeat.at, "2025-11-03T10:15:00.250Z")
        let json = try XCTUnwrap(heartbeat.jsonString())
        XCTAssertEqual(json, #"{"at":"2025-11-03T10:15:00.250Z","hasFullAccess":true,"version":"0.1.0 (1)"}"#)
        XCTAssertEqual(KeyboardHeartbeat.parse(json), heartbeat)
    }

    func testHeartbeatParsingIsStrictAboutFieldsButNotExtras() {
        XCTAssertNil(KeyboardHeartbeat.parse(nil))
        XCTAssertNil(KeyboardHeartbeat.parse("not json"))
        XCTAssertNil(KeyboardHeartbeat.parse(#"{"at":"x"}"#))
        XCTAssertEqual(
            KeyboardHeartbeat.parse(#"{"at":"x","hasFullAccess":false,"version":"1 (2)","extra":1}"#)?.hasFullAccess,
            false
        )
    }

    func testVersionString() {
        XCTAssertEqual(KeyboardHeartbeat.version(shortVersion: "0.1.0", build: "7"), "0.1.0 (7)")
        XCTAssertEqual(KeyboardHeartbeat.version(shortVersion: nil, build: nil), "0 (0)")
    }

    func testKeyboardLangFromDefaults() {
        XCTAssertEqual(SharedDefaults.keyboardLang(fromDefaultsJSON: #"{"relationship":"friend","keyboardLang":"de"}"#), "de")
        XCTAssertNil(SharedDefaults.keyboardLang(fromDefaultsJSON: #"{"relationship":"friend"}"#))
        XCTAssertNil(SharedDefaults.keyboardLang(fromDefaultsJSON: #"{"keyboardLang":3}"#))
        XCTAssertNil(SharedDefaults.keyboardLang(fromDefaultsJSON: "[1]"))
        XCTAssertNil(SharedDefaults.keyboardLang(fromDefaultsJSON: nil))
    }

    func testLayoutLanguageWithFullAccessFollowsTheAppSetting() {
        let language = KeyboardLanguageResolver.keyboardLanguage(
            appGroupDefaultsJSON: #"{"keyboardLang":"fr"}"#,
            preferredLanguages: ["de-DE"],
            primaryLanguage: "en-GB"
        )
        XCTAssertEqual(language, .french)
    }

    func testWithoutFullAccessFallsBackToTheDeviceLanguage() {
        // No App Group values without Full Access (nil).
        XCTAssertEqual(
            KeyboardLanguageResolver.keyboardLanguage(appGroupDefaultsJSON: nil, preferredLanguages: ["pt-PT", "es-ES"], primaryLanguage: "en-GB"),
            .spanish
        )
        XCTAssertEqual(
            KeyboardLanguageResolver.keyboardLanguage(appGroupDefaultsJSON: nil, preferredLanguages: ["pt-PT"], primaryLanguage: "en-GB"),
            .englishUK
        )
        XCTAssertEqual(
            KeyboardLanguageResolver.keyboardLanguage(appGroupDefaultsJSON: nil, preferredLanguages: [], primaryLanguage: "it"),
            .italian
        )
        XCTAssertEqual(
            KeyboardLanguageResolver.keyboardLanguage(appGroupDefaultsJSON: nil, preferredLanguages: [], primaryLanguage: nil),
            .fallback
        )
    }

    func testUnsupportedAppSettingFallsBack() {
        XCTAssertEqual(
            KeyboardLanguageResolver.keyboardLanguage(appGroupDefaultsJSON: #"{"keyboardLang":"pt"}"#, preferredLanguages: ["it-IT"], primaryLanguage: nil),
            .italian
        )
    }

    func testUILanguage() {
        XCTAssertEqual(KeyboardLanguageResolver.uiLanguage(appGroupUILang: "de", preferredLanguages: ["fr"], primaryLanguage: nil), .german)
        XCTAssertEqual(KeyboardLanguageResolver.uiLanguage(appGroupUILang: nil, preferredLanguages: ["fr-CA"], primaryLanguage: nil), .french)
    }
}

final class DiagnosticsFilesTests: XCTestCase {
    func testFileNamesSortByTime() {
        let early = DiagnosticsFiles.fileName(date: Date(timeIntervalSince1970: 9), sequence: 0)
        let late = DiagnosticsFiles.fileName(date: Date(timeIntervalSince1970: 1_762_164_900), sequence: 0)
        XCTAssertEqual(early, "keyboard-diagnostic-0000000000009000-0.json")
        XCTAssertLessThan(early, late)
        XCTAssertTrue(DiagnosticsFiles.isPayloadFile(late))
        XCTAssertFalse(DiagnosticsFiles.isPayloadFile("notes.txt"))
    }

    func testPrunesOldestBeyondTheLimit() {
        let names = (0..<5).map { DiagnosticsFiles.fileName(date: Date(timeIntervalSince1970: Double($0)), sequence: 0) }
        XCTAssertEqual(DiagnosticsFiles.filesToPrune(existing: Array(names.reversed()) + ["other.txt"], adding: 2, keep: 4), Array(names.prefix(3)))
        XCTAssertEqual(DiagnosticsFiles.filesToPrune(existing: names, adding: 0, keep: 10), [])
        XCTAssertEqual(DiagnosticsFiles.filesToPrune(existing: names, adding: 10, keep: 4), names)
    }
}
