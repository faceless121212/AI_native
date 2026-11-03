// Pure logic: no UIKit import, so `swift test` runs on macOS.
//
// Runtime names of the App Group and the shared keychain group. Never hard-coded: they are derived
// from the bundle ID, so production and staging (APP_VARIANT=staging) stay fully separate.
// Build-time source of truth: config/app-groups.js. The rule here must match it:
//   app bundle ID        <app>              app.replywise         | app.replywise.staging
//   keyboard bundle ID   <app>.keyboard     app.replywise.keyboard| app.replywise.staging.keyboard
//   App Group            group.<app>.shared
//   shared keychain      <TeamID>.<app>.shared   ($(AppIdentifierPrefix)<app>.shared)
// src/__tests__/keyboard-groups.test.ts checks this rule against config/app-groups.js and checks
// that modules/keyboard-bridge/ios/BridgeGroups.swift uses the same strings.

import Foundation

public enum SharedGroups {
    /// Suffix of the keyboard extension's bundle ID (targets/keyboard/expo-target.config.js).
    public static let extensionSuffix = ".keyboard"

    /// "app.replywise.keyboard" → "app.replywise". Nil if the ID doesn't end in ".keyboard".
    public static func appBundleID(fromExtensionBundleID extensionID: String) -> String? {
        guard extensionID.hasSuffix(extensionSuffix), extensionID.count > extensionSuffix.count else { return nil }
        return String(extensionID.dropLast(extensionSuffix.count))
    }

    /// "app.replywise" → "group.app.replywise.shared".
    public static func appGroup(forAppBundleID appID: String) -> String {
        "group.\(appID).shared"
    }

    /// "app.replywise.keyboard" → "group.app.replywise.shared".
    public static func appGroup(forExtensionBundleID extensionID: String) -> String? {
        appBundleID(fromExtensionBundleID: extensionID).map(appGroup(forAppBundleID:))
    }

    /// "ABCDE12345." + "app.replywise" → "ABCDE12345.app.replywise.shared".
    public static func sharedKeychainGroup(teamPrefix: String, appBundleID appID: String) -> String {
        "\(teamPrefix)\(appID).shared"
    }

    /// Validates the team prefix from Info.plist (`AppIdentifierPrefix` = `$(AppIdentifierPrefix)`).
    /// Returns "ABCDE12345." for a ten-character team ID with or without the trailing dot; nil when
    /// the build left it empty (unsigned builds) or unexpanded.
    public static func normalizedTeamPrefix(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = trimmed.hasSuffix(".") ? String(trimmed.dropLast()) : trimmed
        guard id.count == 10, id.unicodeScalars.allSatisfy(isTeamIDScalar) else { return nil }
        return id + "."
    }

    /// Team prefix from a keychain access group such as "ABCDE12345.app.replywise".
    public static func teamPrefix(fromAccessGroup group: String) -> String? {
        guard let first = group.split(separator: ".", maxSplits: 1).first else { return nil }
        return normalizedTeamPrefix(String(first))
    }

    private static func isTeamIDScalar(_ scalar: Unicode.Scalar) -> Bool {
        // A–Z or 0–9 (team IDs are upper-case ASCII).
        (65...90).contains(scalar.value) || (48...57).contains(scalar.value)
    }
}

/// Where the device key lives in the shared keychain group (docs/architecture.md §4).
/// modules/keyboard-bridge writes it; the keyboard reads it. Same strings on both sides.
public enum DeviceKeyKeychain {
    public static let service = "app.replywise.device-key"
    public static let account = "v1.deviceKey"
}
