import ExpoModulesCore
import Foundation

/// Bridge between the Replywise app and the iOS keyboard extension.
/// Prompt 0: stub values only. Later prompts read `v1.keyboardHeartbeat` from the App Group
/// (docs/architecture.md §5) and check whether the keyboard is added.
public class KeyboardBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    // JS: requireNativeModule('KeyboardBridge')
    Name("KeyboardBridge")

    Function("getStatus") { () -> [String: Any] in
      return [
        "added": false,
        "hasFullAccess": false,
        // NSNull becomes JS null.
        "heartbeatAt": NSNull(),
      ]
    }
  }
}
