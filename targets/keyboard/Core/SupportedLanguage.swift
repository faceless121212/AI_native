// Pure logic: no UIKit import, so `swift test` runs on macOS.
// In the Xcode extension target this file is compiled into the same module as UI/,
// so UI code uses these types directly (never `import ReplywiseKeyboardCore` from UI/).

import Foundation

/// The five keyboard / reply languages of v1 (en-GB, de, fr, es, it).
/// Raw values are the BCP-47 tags shared with the app, the API and the Android IME subtypes.
public enum SupportedLanguage: String, CaseIterable, Sendable {
    case englishUK = "en-GB"
    case german = "de"
    case french = "fr"
    case spanish = "es"
    case italian = "it"

    /// Used when nothing better is known.
    public static let fallback: SupportedLanguage = .englishUK

    /// Maps a language tag such as "de-AT", "en_US" or "FR" to a supported language.
    /// Only the primary subtag matters; every English variant maps to en-GB.
    /// Returns nil for unsupported or empty tags.
    public static func from(languageTag: String) -> SupportedLanguage? {
        let normalized = languageTag
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
        guard let primary = normalized.split(separator: "-").first else {
            return nil
        }
        switch primary {
        case "en": return .englishUK
        case "de": return .german
        case "fr": return .french
        case "es": return .spanish
        case "it": return .italian
        default: return nil
        }
    }
}
