import Foundation
import Security

/// Read-only view of the shared keychain from the keyboard (docs/architecture.md §4).
/// The app (modules/keyboard-bridge) writes the device key into the shared access group with
/// kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly.
///
/// No kSecAttrAccessGroup in the query on purpose: the keyboard's only keychain-access-group is
/// the shared one (targets/keyboard/expo-target.config.js), and a query without a group searches
/// all of the extension's groups. So the keyboard never needs the team prefix at runtime.
enum SharedKeychainReader {
    /// Whether the device key exists. Never returns or logs the key itself (Prompt 5 needs only
    /// its presence for the NOT_SET_UP state).
    static func hasDeviceKey() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: DeviceKeyKeychain.service,
            kSecAttrAccount as String: DeviceKeyKeychain.account,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }
}
