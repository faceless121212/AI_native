import UIKit

/// The controller's input view. Adopts UIInputViewAudioFeedback so `UIDevice.playInputClick()`
/// plays the system keyboard click; iOS plays it only when the user has Keyboard Clicks on
/// (Settings → Sounds & Haptics), so the click follows the system setting.
final class KeyboardInputView: UIInputView, UIInputViewAudioFeedback {
    var enableInputClicksWhenVisible: Bool { true }
}
