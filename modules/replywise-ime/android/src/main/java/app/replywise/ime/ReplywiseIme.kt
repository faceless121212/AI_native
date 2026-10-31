package app.replywise.ime

import android.inputmethodservice.InputMethodService
import android.os.Build
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import app.replywise.ime.ui.PlaceholderRow

/**
 * The Replywise Android keyboard (declared in this module's AndroidManifest.xml).
 *
 * Prompt 0 placeholder: one row with a switch-keyboard key and the "Replywise" title. No text is
 * read, sent or stored. Typing layout, bar and AI come in later prompts (docs/architecture.md §6).
 * Plain Views for now; the Compose-vs-Views decision is measured and recorded later.
 */
class ReplywiseIme : InputMethodService() {
  private var row: PlaceholderRow? = null

  override fun onCreateInputView(): View {
    val created = PlaceholderRow(this, onSwitchKeyboard = ::switchToNextKeyboard)
    row = created
    return created.view
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    // Re-check on every start: other keyboards can be enabled or disabled while we're alive.
    row?.setSwitchKeyVisible(shouldOfferSwitch())
  }

  override fun onDestroy() {
    row = null
    super.onDestroy()
  }

  private fun shouldOfferSwitch(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      shouldOfferSwitchingToNextInputMethod()
    } else {
      val token = window?.window?.attributes?.token ?: return false
      @Suppress("DEPRECATION")
      inputMethodManager().shouldOfferSwitchingToNextInputMethod(token)
    }

  private fun switchToNextKeyboard() {
    val switched =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        switchToNextInputMethod(false)
      } else {
        val token = window?.window?.attributes?.token
        @Suppress("DEPRECATION")
        token != null && inputMethodManager().switchToNextInputMethod(token, false)
      }
    if (!switched) {
      // No next keyboard in the switching order: fall back to the system picker.
      inputMethodManager().showInputMethodPicker()
    }
  }

  private fun inputMethodManager(): InputMethodManager =
    getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
}
