// Pure logic: no UIKit import, so `swift test` runs on macOS.
// App Group keys and value formats (docs/architecture.md §5). Storage types in
// UserDefaults(suiteName:):
//   Bool            v1.aiEnabled
//   String          v1.uiLang (language tag), v1.trialEndsAt (ISO 8601)
//   String (JSON)   v1.defaults, v1.lastChips, v1.quota, v1.providerDown, v1.keyboardHeartbeat
// modules/keyboard-bridge (index.ts) uses the same types.

import Foundation

public enum AppGroupKey: String, CaseIterable, Sendable {
    case aiEnabled = "v1.aiEnabled"
    case defaults = "v1.defaults"
    case lastChips = "v1.lastChips"
    case quota = "v1.quota"
    case trialEndsAt = "v1.trialEndsAt"
    case providerDown = "v1.providerDown"
    case keyboardHeartbeat = "v1.keyboardHeartbeat"
    case uiLang = "v1.uiLang"
}

/// Written by the keyboard on each open when Full Access is on. Lets the app show
/// "Added ✓ / Full Access ✓". Contains no text and nothing about the host app.
public struct KeyboardHeartbeat: Codable, Equatable, Sendable {
    /// ISO 8601 UTC with milliseconds, e.g. "2026-11-03T10:15:00.123Z" (JS `Date` parses it).
    public let at: String
    public let hasFullAccess: Bool
    /// "<CFBundleShortVersionString> (<CFBundleVersion>)", e.g. "0.1.0 (1)".
    public let version: String

    public init(at: String, hasFullAccess: Bool, version: String) {
        self.at = at
        self.hasFullAccess = hasFullAccess
        self.version = version
    }

    public init(date: Date, hasFullAccess: Bool, version: String) {
        self.init(at: Self.isoString(date), hasFullAccess: hasFullAccess, version: version)
    }

    public static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    public static func version(shortVersion: String?, build: String?) -> String {
        "\(shortVersion ?? "0") (\(build ?? "0"))"
    }

    public func jsonString() -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public static func parse(_ json: String?) -> KeyboardHeartbeat? {
        guard let data = json?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(KeyboardHeartbeat.self, from: data)
    }
}

/// Reads only the field Prompt 5 needs from `v1.defaults`; everything else in it is ignored,
/// so new fields written by the app never break the keyboard.
public enum SharedDefaults {
    public static func keyboardLang(fromDefaultsJSON json: String?) -> String? {
        guard
            let data = json?.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let dict = object as? [String: Any],
            let lang = dict["keyboardLang"] as? String
        else { return nil }
        return lang
    }
}

/// Which language the layout and the keyboard's own strings use (docs/architecture.md §5).
/// With Full Access: the app's settings in the App Group. Without (or when unset): the device
/// language, then the extension's PrimaryLanguage (Info.plist), then en-GB.
public enum KeyboardLanguageResolver {
    public static func keyboardLanguage(
        appGroupDefaultsJSON: String?,
        preferredLanguages: [String],
        primaryLanguage: String?
    ) -> SupportedLanguage {
        if let tag = SharedDefaults.keyboardLang(fromDefaultsJSON: appGroupDefaultsJSON),
           let language = SupportedLanguage.from(languageTag: tag) {
            return language
        }
        return deviceLanguage(preferredLanguages: preferredLanguages, primaryLanguage: primaryLanguage)
    }

    public static func uiLanguage(
        appGroupUILang: String?,
        preferredLanguages: [String],
        primaryLanguage: String?
    ) -> SupportedLanguage {
        if let tag = appGroupUILang, let language = SupportedLanguage.from(languageTag: tag) {
            return language
        }
        return deviceLanguage(preferredLanguages: preferredLanguages, primaryLanguage: primaryLanguage)
    }

    /// First supported language in the user's list (e.g. ["pt-PT", "de-DE"] → de).
    public static func deviceLanguage(preferredLanguages: [String], primaryLanguage: String?) -> SupportedLanguage {
        for tag in preferredLanguages {
            if let language = SupportedLanguage.from(languageTag: tag) { return language }
        }
        if let tag = primaryLanguage, let language = SupportedLanguage.from(languageTag: tag) {
            return language
        }
        return .fallback
    }
}
