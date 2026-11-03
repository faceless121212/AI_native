// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Autocapitalise and double-space period (docs/product-spec.md §3.1).
// Inputs are the host's `documentContextBeforeInput`, which may be nil or only part of the text
// before the cursor. These functions only look at the last few characters and never store text.

import Foundation

/// Mirror of UITextAutocapitalizationType (mapped in UI/, so Core stays UIKit-free).
public enum AutocapitalizationMode: Sendable, Equatable {
    case none
    case words
    case sentences
    case allCharacters
}

/// What kind of field the host shows, from its keyboardType / textContentType / secure entry.
public enum TextFieldKind: Sendable, Equatable {
    case text
    case url
    case email
    case webSearch
    /// Number pads, phone pads and the like.
    case numeric
}

public enum AutoCapitalization {
    static let sentenceEnders: Set<Character> = [".", "!", "?", "…"]
    /// Marks that may sit between a sentence end and the next word ("Stop." She…, (Yes.) ¿Qué…).
    static let transparent: Set<Character> = ["\"", "'", "“", "”", "‘", "’", "«", "»", "„", "(", ")", "[", "]", "¿", "¡"]
    static let wordOpeners: Set<Character> = ["\"", "'", "“", "‘", "«", "„", "(", "[", "¿", "¡"]

    /// Whether the next letter should be upper case, following the host's autocapitalization
    /// type. `contextBefore` nil or empty means the cursor is at the start of the field.
    public static func shouldCapitalize(mode: AutocapitalizationMode, contextBefore: String?) -> Bool {
        switch mode {
        case .none:
            return false
        case .allCharacters:
            return true
        case .words:
            guard let last = contextBefore?.last else { return true }
            return last.isWhitespace || wordOpeners.contains(last)
        case .sentences:
            return isSentenceStart(contextBefore)
        }
    }

    /// True at the start of the field, after a line break, or after ". ! ? …" followed by
    /// at least one space (quotes, brackets and ¿ ¡ in between are skipped).
    public static func isSentenceStart(_ contextBefore: String?) -> Bool {
        guard let text = contextBefore, !text.isEmpty else { return true }
        var sawSpace = false
        for character in text.reversed() {
            if character.isNewline { return true }
            if character.isWhitespace {
                sawSpace = true
                continue
            }
            if transparent.contains(character) { continue }
            if sentenceEnders.contains(character) { return sawSpace }
            return false
        }
        // Only spaces, quotes or brackets so far: still the start of the field.
        return true
    }
}

public enum DoubleSpacePeriod {
    /// Characters after which a double space becomes ". ".
    static let closers: Set<Character> = ["\"", "'", "”", "’", "»", ")", "]"]

    /// No ". " in addresses, e-mail, search or number fields.
    public static func isEnabled(for kind: TextFieldKind) -> Bool {
        kind == .text
    }

    /// Called when space is tapped, before inserting it. True means: delete the space before the
    /// cursor and insert ". " instead. Needs the previous key to have been space too, and a word
    /// (letter, digit or closing quote/bracket) right before that space.
    public static func shouldInsertPeriod(
        contextBefore: String?,
        previousKeyWasSpace: Bool,
        fieldKind: TextFieldKind
    ) -> Bool {
        guard isEnabled(for: fieldKind), previousKeyWasSpace, let text = contextBefore else { return false }
        let tail = Array(text.suffix(2))
        guard tail.count == 2, tail[1] == " " else { return false }
        let previous = tail[0]
        return previous.isLetter || previous.isNumber || closers.contains(previous)
    }
}
