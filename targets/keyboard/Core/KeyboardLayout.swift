// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Key layouts per language and page (docs/product-spec.md §3.1).

import Foundation

/// The three key pages of the keyboard.
public enum KeyboardPage: String, CaseIterable, Sendable {
    case letters
    case numbers
    case symbols
}

/// What a key does when it is pressed.
public enum KeyAction: Hashable, Sendable {
    /// Inserts text. For letters this is the lower-case form; shift is applied by `KeyCase`.
    case character(String)
    case shift
    case delete
    case space
    case returnKey
    /// The globe key. Only present when the host needs it (`needsInputModeSwitchKey`).
    case nextKeyboard
    /// 123 / ABC / #+=.
    case switchPage(KeyboardPage)
}

/// How much room a key takes in its row, in units of one letter key.
public enum KeyWidth: Hashable, Sendable {
    case units(Double)
    /// Takes whatever the fixed keys of the row leave (the space bar).
    case flexible
}

public struct KeyDefinition: Hashable, Sendable, Identifiable {
    /// Unique within one page. Keys that change meaning between pages but stay in the same place
    /// (the bottom-left page key, the left key of the third row) get a fixed slot ID instead, so
    /// SwiftUI keeps the same view and VoiceOver keeps its focus when the page changes.
    public let id: String
    public let action: KeyAction
    public let width: KeyWidth

    /// Slot IDs used by `KeyboardLayouts.layout`.
    public static let pageKeySlot = "slot:pageKey"
    public static let thirdRowLeftSlot = "slot:thirdRowLeft"

    public init(_ action: KeyAction, width: KeyWidth = .units(1), slot: String? = nil) {
        self.action = action
        self.width = width
        if let slot {
            id = slot
            return
        }
        switch action {
        case .character(let text): id = "char:\(text)"
        case .shift: id = "shift"
        case .delete: id = "delete"
        case .space: id = "space"
        case .returnKey: id = "return"
        case .nextKeyboard: id = "nextKeyboard"
        case .switchPage(let page): id = "page:\(page.rawValue)"
        }
    }

    /// The character this key inserts, if it is a character key.
    public var character: String? {
        if case .character(let text) = action { return text }
        return nil
    }
}

public struct KeyboardLayout: Equatable, Sendable {
    public let language: SupportedLanguage
    public let page: KeyboardPage
    public let rows: [[KeyDefinition]]

    /// Width of the widest row in key units. Every row is laid out against this, so letter keys
    /// have the same width in every row and shorter rows are centred.
    public var maxRowUnits: Double {
        rows.map { KeyboardLayout.fixedUnits(of: $0) }.max() ?? 0
    }

    /// Fixed units of one row (flexible keys excluded).
    public static func fixedUnits(of row: [KeyDefinition]) -> Double {
        var total = 0.0
        for key in row {
            if case .units(let units) = key.width { total += units }
        }
        return total
    }

    public var allKeys: [KeyDefinition] { rows.flatMap { $0 } }
}

public enum KeyboardLayouts {
    /// Letter rows (lower case) per language. Mirrors the system keyboards for each language:
    /// en and it QWERTY, es QWERTY with ñ, de QWERTZ with ü ö ä (ß on long-press of s),
    /// fr AZERTY with an apostrophe key (é è à ç ù on long-press).
    public static func letterRows(for language: SupportedLanguage) -> [[String]] {
        switch language {
        case .englishUK, .italian:
            return [
                ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
                ["z", "x", "c", "v", "b", "n", "m"],
            ]
        case .spanish:
            return [
                ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
                ["z", "x", "c", "v", "b", "n", "m"],
            ]
        case .german:
            return [
                ["q", "w", "e", "r", "t", "z", "u", "i", "o", "p", "ü"],
                ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ö", "ä"],
                ["y", "x", "c", "v", "b", "n", "m"],
            ]
        case .french:
            return [
                ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
                ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
                ["w", "x", "c", "v", "b", "n", "'"],
            ]
        }
    }

    /// The local currency first: £ for the UK, € for the other four markets.
    public static func primaryCurrency(for language: SupportedLanguage) -> String {
        language == .englishUK ? "£" : "€"
    }

    public static func numberRows(for language: SupportedLanguage) -> [[String]] {
        [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
            ["-", "/", ":", ";", "(", ")", primaryCurrency(for: language), "&", "@", "\""],
            [".", ",", "?", "!", "'"],
        ]
    }

    public static func symbolRows(for language: SupportedLanguage) -> [[String]] {
        let others = language == .englishUK ? ["€", "$", "¥"] : ["£", "$", "¥"]
        return [
            ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="],
            ["_", "\\", "|", "~", "<", ">"] + others + ["•"],
            [".", ",", "?", "!", "'"],
        ]
    }

    /// Width of shift / delete (and 123 / #+= on the third row).
    static let sideKeyUnits = 1.5
    /// Width of the punctuation keys on the third row of the numbers and symbols pages.
    static let punctuationUnits = 1.4
    static let pageKeyUnits = 1.25
    static let nextKeyboardUnits = 1.25
    static let returnKeyUnits = 2.25

    public static func layout(
        language: SupportedLanguage,
        page: KeyboardPage,
        showsNextKeyboard: Bool
    ) -> KeyboardLayout {
        let chars: [[String]]
        switch page {
        case .letters: chars = letterRows(for: language)
        case .numbers: chars = numberRows(for: language)
        case .symbols: chars = symbolRows(for: language)
        }

        var rows: [[KeyDefinition]] = []
        for row in chars.dropLast() {
            rows.append(row.map { KeyDefinition(.character($0)) })
        }

        let last = chars.last ?? []
        var third: [KeyDefinition] = []
        switch page {
        case .letters:
            third.append(KeyDefinition(.shift, width: .units(sideKeyUnits), slot: KeyDefinition.thirdRowLeftSlot))
            for character in last {
                third.append(KeyDefinition(.character(character)))
            }
        case .numbers, .symbols:
            let toggle: KeyboardPage = page == .numbers ? .symbols : .numbers
            third.append(KeyDefinition(.switchPage(toggle), width: .units(sideKeyUnits), slot: KeyDefinition.thirdRowLeftSlot))
            for character in last {
                third.append(KeyDefinition(.character(character), width: .units(punctuationUnits)))
            }
        }
        third.append(KeyDefinition(.delete, width: .units(sideKeyUnits)))
        rows.append(third)

        var bottom: [KeyDefinition] = [
            KeyDefinition(
                .switchPage(page == .letters ? .numbers : .letters),
                width: .units(pageKeyUnits),
                slot: KeyDefinition.pageKeySlot
            ),
        ]
        if showsNextKeyboard {
            bottom.append(KeyDefinition(.nextKeyboard, width: .units(nextKeyboardUnits)))
        }
        bottom.append(KeyDefinition(.space, width: .flexible))
        bottom.append(KeyDefinition(.returnKey, width: .units(returnKeyUnits)))
        rows.append(bottom)

        return KeyboardLayout(language: language, page: page, rows: rows)
    }

    /// Visible label of a page key. These are symbols, the same in all five languages (like the
    /// system keyboards); their spoken labels come from KeyboardStrings.
    public static func pageKeyLabel(_ target: KeyboardPage) -> String {
        switch target {
        case .letters: return "ABC"
        case .numbers: return "123"
        case .symbols: return "#+="
        }
    }

    /// iOS goes back to the letters after a space or an apostrophe typed on the numbers or
    /// symbols page, so "it's 5 pm" needs no extra page switch.
    /// Never while another key is still held (`otherKeyHeld`): switching would remove that key's
    /// view under the finger, so its release would never arrive (rolling typing, code review #2).
    public static func pageAfterInserting(
        _ text: String,
        on page: KeyboardPage,
        otherKeyHeld: Bool = false
    ) -> KeyboardPage {
        guard page != .letters, !otherKeyHeld else { return page }
        return (text == " " || text == "'") ? .letters : page
    }
}

/// Upper-casing of key labels and inserted letters.
public enum KeyCase {
    public static func apply(_ text: String, shifted: Bool) -> String {
        guard shifted else { return text }
        // "ß".uppercased() is "SS" (two letters); keep ß like the system German keyboard.
        if text == "ß" { return text }
        return text.uppercased()
    }
}
