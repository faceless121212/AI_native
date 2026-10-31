package app.replywise.keyboardbridge

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridge between the Replywise app and the Android IME.
 * Prompt 0: stub values only. Later prompts check InputMethodManager.enabledInputMethodList,
 * Settings.Secure.DEFAULT_INPUT_METHOD and the IME heartbeat in SharedPreferences.
 */
class KeyboardBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    // JS: requireNativeModule('KeyboardBridge')
    Name("KeyboardBridge")

    Function("getStatus") {
      mapOf<String, Any?>(
        "added" to false,
        "hasFullAccess" to false,
        "heartbeatAt" to null,
      )
    }
  }
}
