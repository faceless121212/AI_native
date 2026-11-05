import XCTest
@testable import ReplywiseKeyboardCore

final class ReturnKeyTests: XCTestCase {
    func testMapsEveryUIReturnKeyType() {
        let expected: [Int: ReturnKeyKind] = [
            0: .standard, 1: .go, 2: .search, 3: .join, 4: .next, 5: .route,
            6: .search, 7: .send, 8: .search, 9: .done, 10: .emergencyCall, 11: .continueKey,
        ]
        for (raw, kind) in expected {
            XCTAssertEqual(ReturnKeyKind.from(uiReturnKeyTypeRawValue: raw), kind, "raw \(raw)")
        }
        XCTAssertEqual(ReturnKeyKind.from(uiReturnKeyTypeRawValue: 99), .standard)
        XCTAssertEqual(ReturnKeyKind.from(uiReturnKeyTypeRawValue: -1), .standard)
    }

    func testEnglishLabels() {
        let en = KeyboardStrings.en
        XCTAssertEqual(ReturnKeyKind.standard.label(en), "return")
        XCTAssertEqual(ReturnKeyKind.send.label(en), "send")
        XCTAssertEqual(ReturnKeyKind.search.label(en), "search")
        XCTAssertEqual(ReturnKeyKind.continueKey.label(en), "continue")
    }

    func testEveryLabelIsSetInEveryLanguage() {
        for language in SupportedLanguage.allCases {
            let strings = KeyboardStrings.forLanguage(language)
            for kind in ReturnKeyKind.allCases {
                XCTAssertFalse(kind.label(strings).trimmingCharacters(in: .whitespaces).isEmpty, "\(language) \(kind)")
            }
        }
    }

    func testProminenceAndAutoEnable() {
        XCTAssertFalse(ReturnKeyKind.standard.isProminent)
        XCTAssertTrue(ReturnKeyKind.send.isProminent)
        XCTAssertTrue(ReturnKeyKind.isEnabled(enablesReturnKeyAutomatically: false, hasText: false))
        XCTAssertFalse(ReturnKeyKind.isEnabled(enablesReturnKeyAutomatically: true, hasText: false))
        XCTAssertTrue(ReturnKeyKind.isEnabled(enablesReturnKeyAutomatically: true, hasText: true))
    }
}

final class BarStateTests: XCTestCase {
    private func resolve(
        fullAccess: Bool = true,
        secure: Bool = false,
        aiEnabled: Bool? = true,
        deviceKey: Bool = true
    ) -> BarState {
        BarStateResolver.resolve(hasFullAccess: fullAccess, isSecureField: secure, aiEnabled: aiEnabled, hasDeviceKey: deviceKey)
    }

    func testNoFullAccessWinsOverEverythingButPasswordFields() {
        XCTAssertEqual(resolve(fullAccess: false), .noAccess)
        XCTAssertEqual(resolve(fullAccess: false, aiEnabled: nil, deviceKey: false), .noAccess)
        XCTAssertEqual(resolve(fullAccess: false, aiEnabled: false), .noAccess)
    }

    func testPasswordFieldIsTypingOnly() {
        XCTAssertEqual(resolve(secure: true), .typingOnly)
        XCTAssertEqual(resolve(fullAccess: false, secure: true), .typingOnly)
        XCTAssertNil(BarState.typingOnly.message(.en))
    }

    func testAppNeverOpened() {
        XCTAssertEqual(resolve(aiEnabled: nil, deviceKey: false), .notSetUp)
        XCTAssertEqual(resolve(aiEnabled: nil, deviceKey: true), .notSetUp)
    }

    func testConsentOff() {
        XCTAssertEqual(resolve(aiEnabled: false), .aiOff)
        XCTAssertEqual(resolve(aiEnabled: false, deviceKey: false), .aiOff)
    }

    func testNoDeviceKeyYet() {
        XCTAssertEqual(resolve(aiEnabled: true, deviceKey: false), .notSetUp)
    }

    func testReady() {
        XCTAssertEqual(resolve(), .idle)
        XCTAssertNil(BarState.idle.message(.en))
    }

    func testMessagesAreTheSpecCopy() {
        let en = KeyboardStrings.en
        XCTAssertEqual(
            BarState.noAccess.message(en),
            BarMessage(text: en.barNoFullAccess, detail: en.barNoFullAccessPath)
        )
        XCTAssertEqual(BarState.aiOff.message(en)?.text, "AI replies are off. Turn them on in the Replywise app.")
        XCTAssertEqual(BarState.notSetUp.message(en)?.text, "Open the Replywise app once to set up AI replies.")
        XCTAssertEqual(BarState.noAccess.message(en)?.lineCount, 4)
        XCTAssertEqual(BarState.aiOff.message(en)?.lineCount, 2)
    }

    func testLandscapeShowsTheMessageOnlyButVoiceOverReadsBoth() {
        let message = BarMessage(text: "Turn it on.", detail: "Settings → Keyboards")
        XCTAssertTrue(message.showsDetail(compactHeight: false))
        XCTAssertFalse(message.showsDetail(compactHeight: true))
        XCTAssertEqual(message.spokenText, "Turn it on. Settings → Keyboards")
        XCTAssertEqual(BarMessage(text: "Off.", detail: nil).spokenText, "Off.")
        XCTAssertFalse(BarMessage(text: "Off.", detail: nil).showsDetail(compactHeight: false))
    }
}

final class KeyboardMetricsTests: XCTestCase {
    func testRowHeights() {
        XCTAssertEqual(KeyboardMetrics.rowHeight(compactHeight: false), 54)
        XCTAssertEqual(KeyboardMetrics.rowHeight(compactHeight: true), 40)
        XCTAssertEqual(KeyboardMetrics.keyboardHeight(rowCount: 4, compactHeight: false, barHeight: 44), 260)
    }

    func testBarGrowsWithTextSizeUpToTheCap() {
        let base = KeyboardMetrics.barHeight(lines: 2, fontScale: 1, compactHeight: false)
        XCTAssertEqual(base, 44)
        let large = KeyboardMetrics.barHeight(lines: 2, fontScale: 1.5, compactHeight: false)
        XCTAssertGreaterThan(large, base)
        let capped = KeyboardMetrics.barHeight(lines: 2, fontScale: 5, compactHeight: false)
        XCTAssertEqual(capped, KeyboardMetrics.barHeight(lines: 2, fontScale: KeyboardMetrics.maxBarFontScale, compactHeight: false))
        XCTAssertEqual(KeyboardMetrics.barHeight(lines: 2, fontScale: 0.5, compactHeight: false), base)
    }

    func testNoFullAccessBarIsTallerButNotInLandscape() {
        let fourLines = KeyboardMetrics.barHeight(lines: 4, fontScale: 1, compactHeight: false)
        XCTAssertEqual(fourLines, 74)
        XCTAssertEqual(KeyboardMetrics.barHeight(lines: 4, fontScale: 1, compactHeight: true), 44)
    }

    func testMeasuredBarHeight() {
        XCTAssertEqual(KeyboardMetrics.barHeight(measuredTextHeight: 16).height, 44)
        XCTAssertFalse(KeyboardMetrics.barHeight(measuredTextHeight: 16).capped)
        XCTAssertEqual(KeyboardMetrics.barHeight(measuredTextHeight: 99.2).height, 110)
        let capped = KeyboardMetrics.barHeight(measuredTextHeight: 400)
        XCTAssertEqual(capped.height, KeyboardMetrics.barMaxHeightRegular)
        XCTAssertTrue(capped.capped)
    }

    func testHapticsOnlyWithFullAccess() {
        XCTAssertTrue(KeyFeedbackPolicy.playsHaptic(hasFullAccess: true))
        XCTAssertFalse(KeyFeedbackPolicy.playsHaptic(hasFullAccess: false))
    }
}
