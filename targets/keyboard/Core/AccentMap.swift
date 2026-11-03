// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Long-press alternatives per language (docs/product-spec.md §3.1: "Long-press accents for all").

import Foundation

public enum AccentMap {
    /// Alternatives shown on long-press, most used in that language first. Lower case; the
    /// caller applies `KeyCase` when shift is on. The key's own character is not repeated.
    /// Empty when the key has no alternatives.
    public static func alternatives(for base: String, language: SupportedLanguage) -> [String] {
        if let letters = letterMaps[language]?[base] { return letters }
        return punctuation(for: base, language: language)
    }

    /// Keys that have a long-press popup, for VoiceOver custom actions and tests.
    public static func hasAlternatives(_ base: String, language: SupportedLanguage) -> Bool {
        !alternatives(for: base, language: language).isEmpty
    }

    // MARK: - Letters

    private static let letterMaps: [SupportedLanguage: [String: [String]]] = [
        .englishUK: [
            "a": ["à", "á", "â", "ä", "æ", "ã", "å", "ā"],
            "c": ["ç", "ć", "č"],
            "e": ["é", "è", "ê", "ë", "ē", "ė", "ę"],
            "i": ["í", "î", "ï", "ì", "ī", "į"],
            "l": ["ł"],
            "n": ["ñ", "ń"],
            "o": ["ó", "ô", "ö", "ò", "œ", "ø", "ō", "õ"],
            "s": ["ß", "ś", "š"],
            "u": ["ú", "û", "ü", "ù", "ū"],
            "y": ["ÿ"],
            "z": ["ž", "ź", "ż"],
        ],
        .german: [
            "a": ["ä", "à", "á", "â", "æ", "ã", "å", "ā"],
            "c": ["ç", "ć", "č"],
            "e": ["é", "è", "ê", "ë", "ė"],
            "i": ["î", "ï", "í", "ì", "ī"],
            "n": ["ñ", "ń"],
            "o": ["ö", "ô", "ò", "ó", "õ", "œ", "ø", "ō"],
            "s": ["ß", "ś", "š"],
            "u": ["ü", "û", "ù", "ú", "ū"],
            "y": ["ÿ"],
            "z": ["ž", "ź", "ż"],
        ],
        .french: [
            "a": ["à", "â", "æ", "á", "ä", "ã", "å", "ā"],
            "c": ["ç", "ć", "č"],
            "e": ["é", "è", "ê", "ë", "ē", "ę", "ė"],
            "i": ["î", "ï", "ì", "í", "ī", "į"],
            "n": ["ñ", "ń"],
            "o": ["ô", "œ", "ö", "ò", "ó", "õ", "ø", "ō"],
            "u": ["ù", "û", "ü", "ú", "ū"],
            "y": ["ÿ"],
        ],
        .spanish: [
            "a": ["á", "à", "ä", "â", "ã", "å", "ā", "æ"],
            "c": ["ç", "ć", "č"],
            "e": ["é", "è", "ë", "ê", "ē"],
            "i": ["í", "ì", "ï", "î", "ī"],
            "n": ["ń"],
            "o": ["ó", "ò", "ö", "ô", "õ", "ø", "ō", "œ"],
            "u": ["ú", "ü", "ù", "û", "ū"],
        ],
        .italian: [
            "a": ["à", "á", "â", "ä", "æ", "ã", "å", "ā"],
            "c": ["ç", "ć", "č"],
            "e": ["è", "é", "ê", "ë", "ē"],
            "i": ["ì", "í", "î", "ï", "ī"],
            "n": ["ñ", "ń"],
            "o": ["ò", "ó", "ô", "ö", "õ", "ø", "œ", "ō"],
            "u": ["ù", "ú", "û", "ü", "ū"],
        ],
    ]

    // MARK: - Punctuation and symbols

    private static func punctuation(for base: String, language: SupportedLanguage) -> [String] {
        switch base {
        case "\"":
            switch language {
            case .german: return ["„", "“", "”", "»", "«"]
            case .french, .spanish, .italian: return ["«", "»", "“", "”", "„"]
            case .englishUK: return ["“", "”", "„", "«", "»"]
            }
        case "'":
            return ["’", "‘", "‚", "`"]
        case "-": return ["–", "—", "•"]
        case ".": return ["…"]
        case "?": return ["¿"]
        case "!": return ["¡"]
        case "0": return ["°"]
        case "%": return ["‰"]
        case "&": return ["§"]
        case "/": return ["\\"]
        case "€", "£", "$", "¥": return ["€", "£", "$", "¥", "¢", "₩", "₽"].filter { $0 != base }
        default: return []
        }
    }
}

/// Which accent in the popup is under the finger.
public enum AccentPopupAlignment: Sendable {
    /// The popup's left edge lines up with the key's left edge (keys on the left half).
    case leading
    /// The popup's right edge lines up with the key's right edge (keys on the right half).
    case trailing

    /// Keys in the left half of a row open to the right, the others to the left, so the popup
    /// never runs off the screen.
    public static func forKey(at index: Int, rowCount: Int) -> AccentPopupAlignment {
        index * 2 < rowCount ? .leading : .trailing
    }
}

public enum AccentSelection {
    /// Index of the cell under `touchX` (in the key's own coordinates, 0 = key's left edge).
    /// Always a valid index: moving past either end keeps the outermost cell selected.
    public static func index(
        touchX: Double,
        keyWidth: Double,
        cellWidth: Double,
        count: Int,
        alignment: AccentPopupAlignment
    ) -> Int {
        guard count > 0, cellWidth > 0 else { return 0 }
        let popupLeft: Double
        switch alignment {
        case .leading: popupLeft = 0
        case .trailing: popupLeft = keyWidth - Double(count) * cellWidth
        }
        let raw = Int(((touchX - popupLeft) / cellWidth).rounded(.down))
        return min(max(raw, 0), count - 1)
    }

    /// Where the popup starts, relative to the key's left edge.
    public static func popupOffsetX(
        keyWidth: Double,
        cellWidth: Double,
        count: Int,
        alignment: AccentPopupAlignment
    ) -> Double {
        switch alignment {
        case .leading: return 0
        case .trailing: return keyWidth - Double(count) * cellWidth
        }
    }
}
