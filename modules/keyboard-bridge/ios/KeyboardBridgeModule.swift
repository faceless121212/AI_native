import ExpoModulesCore
import Foundation

/// Bridge between the Replywise app and the iOS keyboard extension (docs/architecture.md §4–5).
///
/// - getStatus: keyboard status from the keyboard's heartbeat in the App Group.
/// - App Group get/set for the `v1.*` keys (Bool for v1.aiEnabled, String for the others; JSON
///   values are strings, encoded in index.ts).
/// - Shared keychain get/set/delete for the keyboard's device key.
///
/// "added": iOS has no public API that lists the user's enabled keyboards. Reading the
/// undocumented "AppleKeyboards" preference is not used (not an API Apple documents or supports,
/// so it can break or be flagged in review). Instead: added = the keyboard has written a heartbeat.
/// The keyboard can only write it with Full Access, so before Full Access is on the app can't tell
/// "added" from "not added" (docs/keyboard-manual-test.md, "Setup detection").
public class KeyboardBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    // JS: requireNativeModule('KeyboardBridge')
    Name("KeyboardBridge")

    Function("getStatus") { () -> [String: Any] in
      let heartbeat = BridgeAppGroup.heartbeat()
      var status: [String: Any] = [
        "added": heartbeat != nil,
        "hasFullAccess": heartbeat?.hasFullAccess ?? false,
      ]
      if let at = heartbeat?.at {
        status["heartbeatAt"] = at
      } else {
        // NSNull becomes JS null.
        status["heartbeatAt"] = NSNull()
      }
      return status
    }

    Function("getAppGroupBool") { (key: String) throws -> Bool? in
      guard BridgeAppGroup.boolKeys.contains(key) else { throw InvalidAppGroupKeyException(key) }
      guard let defaults = BridgeAppGroup.defaults else { throw AppGroupUnavailableException() }
      return defaults.object(forKey: key) as? Bool
    }

    Function("setAppGroupBool") { (key: String, value: Bool?) throws in
      guard BridgeAppGroup.boolKeys.contains(key) else { throw InvalidAppGroupKeyException(key) }
      guard let defaults = BridgeAppGroup.defaults else { throw AppGroupUnavailableException() }
      if let value {
        defaults.set(value, forKey: key)
      } else {
        defaults.removeObject(forKey: key)
      }
    }

    Function("getAppGroupString") { (key: String) throws -> String? in
      guard BridgeAppGroup.stringKeys.contains(key) else { throw InvalidAppGroupKeyException(key) }
      guard let defaults = BridgeAppGroup.defaults else { throw AppGroupUnavailableException() }
      return defaults.string(forKey: key)
    }

    Function("setAppGroupString") { (key: String, value: String?) throws in
      guard BridgeAppGroup.stringKeys.contains(key) else { throw InvalidAppGroupKeyException(key) }
      guard let defaults = BridgeAppGroup.defaults else { throw AppGroupUnavailableException() }
      if let value {
        defaults.set(value, forKey: key)
      } else {
        defaults.removeObject(forKey: key)
      }
    }

    Function("getDeviceKey") { () throws -> String? in
      do {
        return try DeviceKeyStore.get()
      } catch {
        throw KeychainException(KeyboardBridgeModule.describe(error))
      }
    }

    Function("setDeviceKey") { (key: String) throws in
      guard !key.isEmpty else { throw KeychainException("empty key") }
      do {
        try DeviceKeyStore.set(key)
      } catch {
        throw KeychainException(KeyboardBridgeModule.describe(error))
      }
    }

    Function("deleteDeviceKey") { () throws in
      do {
        try DeviceKeyStore.delete()
      } catch {
        throw KeychainException(KeyboardBridgeModule.describe(error))
      }
    }
  }

  /// Error text without the key or any value.
  static func describe(_ error: Error) -> String {
    guard let failure = error as? DeviceKeyStore.Failure else { return "unknown keychain error" }
    switch failure {
    case .groupUnavailable:
      return "shared keychain group unavailable (team prefix not found)"
    case .status(let status):
      return "OSStatus \(status)"
    }
  }
}

final class InvalidAppGroupKeyException: GenericException<String> {
  override var reason: String { "Not a v1 App Group key of this type: \(param)" }
}

final class AppGroupUnavailableException: Exception {
  override var reason: String { "App Group container unavailable (check the App Group entitlement)" }
}

final class KeychainException: GenericException<String> {
  override var reason: String { "Device key keychain error: \(param)" }
}
