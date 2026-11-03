import Foundation
import Security

/// App Group and shared keychain group of the containing app, derived at runtime from the app's
/// bundle ID so production and staging (APP_VARIANT=staging) never mix.
///
/// SAME RULE as targets/keyboard/Core/SharedGroups.swift (the keyboard can't share code with this
/// pod). Build-time source of truth: config/app-groups.js. src/__tests__/keyboard-groups.test.ts
/// checks the rule and the device-key item names against both Swift files.
///   App Group        group.<app bundle ID>.shared
///   shared keychain  <TeamID>.<app bundle ID>.shared
enum BridgeGroups {
    static func appGroup(forAppBundleID appID: String) -> String {
        "group.\(appID).shared"
    }

    static func sharedKeychainGroup(teamPrefix: String, appBundleID appID: String) -> String {
        "\(teamPrefix)\(appID).shared"
    }

    /// Device key item in the shared keychain group (docs/architecture.md §4).
    static let deviceKeyService = "app.replywise.device-key"
    static let deviceKeyAccount = "v1.deviceKey"

    /// Info.plist key set to `$(AppIdentifierPrefix)` in app.config.ts (`ios.infoPlist`).
    static let infoPlistTeamPrefixKey = "AppIdentifierPrefix"

    static var currentAppGroup: String? {
        Bundle.main.bundleIdentifier.map(appGroup(forAppBundleID:))
    }

    static var currentSharedKeychainGroup: String? {
        guard let appID = Bundle.main.bundleIdentifier, let prefix = teamPrefix else { return nil }
        return sharedKeychainGroup(teamPrefix: prefix, appBundleID: appID)
    }

    /// The team prefix ("ABCDE12345."), resolved once per process:
    /// 1. Info.plist `AppIdentifierPrefix`, which Xcode expands from the signing team at build time.
    /// 2. Fallback when the build left it empty (e.g. no team set): the access group of a probe
    ///    keychain item saved without an explicit group. iOS saves it in the app's FIRST
    ///    keychain-access-group, `$(AppIdentifierPrefix)app.replywise`, whose first component is
    ///    the team prefix. The probe holds no secret.
    static let teamPrefix: String? = {
        let plistValue = Bundle.main.object(forInfoDictionaryKey: infoPlistTeamPrefixKey) as? String
        if let prefix = BridgeGroups.normalizedTeamPrefix(plistValue) { return prefix }
        return BridgeGroups.probeTeamPrefix()
    }()

    /// Ten upper-case letters or digits, returned with the trailing dot; nil otherwise.
    static func normalizedTeamPrefix(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = trimmed.hasSuffix(".") ? String(trimmed.dropLast()) : trimmed
        let valid = id.count == 10 && id.unicodeScalars.allSatisfy {
            (65...90).contains($0.value) || (48...57).contains($0.value)
        }
        return valid ? id + "." : nil
    }

    private static func probeTeamPrefix() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.replywise.team-prefix-probe",
            kSecAttrAccount as String: "probe",
            kSecReturnAttributes as String: true,
        ]
        var result: CFTypeRef?
        var status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            var add = query
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(add as CFDictionary, &result)
        }
        guard
            status == errSecSuccess,
            let attributes = result as? [String: Any],
            let group = attributes[kSecAttrAccessGroup as String] as? String,
            let first = group.split(separator: ".", maxSplits: 1).first
        else { return nil }
        return normalizedTeamPrefix(String(first))
    }
}

/// The keyboard's device key in the shared keychain group. Written by the app after AI consent
/// (Prompt 7), read by the keyboard (targets/keyboard/UI/SharedKeychainReader.swift), deleted on
/// consent withdrawal, sign-out or Delete my data. Never logged.
enum DeviceKeyStore {
    enum Failure: Error {
        case groupUnavailable
        case status(OSStatus)
    }

    private static func baseQuery() throws -> [String: Any] {
        guard let group = BridgeGroups.currentSharedKeychainGroup else { throw Failure.groupUnavailable }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: BridgeGroups.deviceKeyService,
            kSecAttrAccount as String: BridgeGroups.deviceKeyAccount,
            kSecAttrAccessGroup as String: group,
            // Not synced to iCloud Keychain.
            kSecAttrSynchronizable as String: false,
        ]
    }

    static func get() throws -> String? {
        var query = try baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw Failure.status(status) }
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String) throws {
        let query = try baseQuery()
        let data = Data(key.utf8)
        // AfterFirstUnlock: the keyboard must read it while the phone is locked-then-unlocked
        // and in the background. ThisDeviceOnly: a backup restored to another phone gets no key
        // (the app then asks the server for a new one).
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add.merge(attributes) { _, new in new }
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw Failure.status(status) }
    }

    static func delete() throws {
        let query = try baseQuery()
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.status(status) }
    }
}

/// The App Group's `v1.*` keys (docs/architecture.md §5, targets/keyboard/Core/AppGroupContract.swift).
enum BridgeAppGroup {
    static let boolKeys: Set<String> = ["v1.aiEnabled"]
    static let stringKeys: Set<String> = [
        "v1.defaults", "v1.lastChips", "v1.quota", "v1.trialEndsAt",
        "v1.providerDown", "v1.keyboardHeartbeat", "v1.uiLang",
    ]

    static var defaults: UserDefaults? {
        BridgeGroups.currentAppGroup.flatMap { UserDefaults(suiteName: $0) }
    }

    struct Heartbeat {
        let at: String
        let hasFullAccess: Bool
    }

    /// `v1.keyboardHeartbeat` = {at, hasFullAccess, version}, written by the keyboard on each open
    /// with Full Access. Nil if missing or malformed.
    static func heartbeat() -> Heartbeat? {
        guard
            let json = defaults?.string(forKey: "v1.keyboardHeartbeat"),
            let data = json.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let dict = object as? [String: Any],
            let at = dict["at"] as? String,
            let hasFullAccess = dict["hasFullAccess"] as? Bool
        else { return nil }
        return Heartbeat(at: at, hasFullAccess: hasFullAccess)
    }
}
