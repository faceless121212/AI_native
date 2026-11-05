import Combine
import SwiftUI
import UIKit

/// Receives key events from the SwiftUI keys. Implemented by KeyboardViewController, which owns
/// all text editing through `textDocumentProxy`.
@MainActor
protocol KeyboardActionHandler: AnyObject {
    /// Finger down on a key (click / haptic, shift toggle, delete starts repeating).
    func keyDown(_ action: KeyAction)
    /// Finger up on the key it went down on: commits the key.
    func keyUp(_ action: KeyAction)
    /// The touch was cancelled (e.g. the keyboard went away): nothing is inserted.
    func keyCancelled(_ action: KeyAction)
    /// VoiceOver / Switch Control action on the shift key: caps lock on, or off if it is on.
    func toggleCapsLock()
    /// The long-press popup wants to open. True: open it, and the key's own character will not be
    /// inserted. False: the character was already committed (rolling typing), so no popup.
    func shouldShowAlternatives(for action: KeyAction) -> Bool
    /// A long-press alternative (accent) was chosen.
    func insertAlternative(_ text: String)
    /// VoiceOver activation (double-tap, or lift in touch typing): one complete key press.
    func activate(_ action: KeyAction)
}

/// How one key looks and reads, derived from the model's state.
struct KeyFace: Equatable {
    var title: String?
    var systemImage: String?
    var accessibilityLabel: String
    /// VoiceOver value, e.g. the shift state ("on", "off", "Caps lock").
    var accessibilityValue: String?
    /// Name of the shift key's custom "Caps lock" action (nil on other keys).
    var capsLockActionLabel: String?
    var isSpecial = false
    var isProminent = false
    var isSelected = false
    var isEnabled = true
    var alternatives: [String] = []
}

/// State shared by the controller and the SwiftUI views. One instance per controller, created
/// once with the single hosting controller; views never create their own models.
@MainActor
final class KeyboardModel: ObservableObject {
    @Published private(set) var layout: KeyboardLayout
    @Published private(set) var strings: KeyboardStrings
    @Published private(set) var shift: ShiftState = .off
    @Published private(set) var returnKind: ReturnKeyKind = .standard
    @Published private(set) var returnEnabled = true
    @Published private(set) var barMessage: BarMessage?
    @Published private(set) var barHeight: CGFloat = CGFloat(KeyboardMetrics.barMinHeight)
    @Published private(set) var keysHeight: CGFloat = CGFloat(4 * KeyboardMetrics.rowHeightRegular)
    /// Landscape iPhone: the bar shows only its message line.
    @Published private(set) var compactHeight = false
    /// The bar hit its height cap, so its text may shrink to fit.
    @Published private(set) var barTextMayShrink = false

    weak var handler: KeyboardActionHandler?
    /// Target of the globe key's `handleInputModeList(from:with:)`.
    weak var inputModeController: UIInputViewController?

    private(set) var language: SupportedLanguage
    private(set) var page: KeyboardPage = .letters
    private(set) var showsNextKeyboard = false

    init(language: SupportedLanguage, strings: KeyboardStrings) {
        self.language = language
        self.strings = strings
        layout = KeyboardLayouts.layout(language: language, page: .letters, showsNextKeyboard: false)
    }

    // MARK: - Updates from the controller (each publishes only on a real change)

    func configure(language: SupportedLanguage, strings: KeyboardStrings) {
        if strings.language != self.strings.language { self.strings = strings }
        if language != self.language {
            self.language = language
            rebuildLayout()
        }
    }

    /// True when the page actually changed.
    @discardableResult
    func setPage(_ page: KeyboardPage) -> Bool {
        guard page != self.page else { return false }
        self.page = page
        rebuildLayout()
        return true
    }

    func setShowsNextKeyboard(_ shows: Bool) {
        guard shows != showsNextKeyboard else { return }
        showsNextKeyboard = shows
        rebuildLayout()
    }

    func setShift(_ state: ShiftState) {
        if state != shift { shift = state }
    }

    func setReturnKey(kind: ReturnKeyKind, enabled: Bool) {
        if kind != returnKind { returnKind = kind }
        if enabled != returnEnabled { returnEnabled = enabled }
    }

    func setBarMessage(_ message: BarMessage?) {
        if message != barMessage { barMessage = message }
    }

    func setCompactHeight(_ compact: Bool) {
        if compact != compactHeight { compactHeight = compact }
    }

    /// BCP-47 tag VoiceOver should speak key labels and bar messages in.
    var speechLanguage: String { strings.language.rawValue }

    func setBarTextMayShrink(_ shrink: Bool) {
        if shrink != barTextMayShrink { barTextMayShrink = shrink }
    }

    func setHeights(bar: CGFloat, keys: CGFloat) {
        if bar != barHeight { barHeight = bar }
        if keys != keysHeight { keysHeight = keys }
    }

    private func rebuildLayout() {
        layout = KeyboardLayouts.layout(language: language, page: page, showsNextKeyboard: showsNextKeyboard)
    }

    // MARK: - Key faces

    var isShiftedLetters: Bool { page == .letters && shift.isUppercase }

    func face(for key: KeyDefinition) -> KeyFace {
        switch key.action {
        case .character(let base):
            let title = KeyCase.apply(base, shifted: isShiftedLetters)
            return KeyFace(
                title: title,
                accessibilityLabel: title,
                alternatives: AccentMap.alternatives(for: base, language: language).map {
                    KeyCase.apply($0, shifted: isShiftedLetters)
                }
            )
        case .shift:
            let image: String
            switch shift {
            case .off: image = "shift"
            case .on: image = "shift.fill"
            case .capsLock: image = "capslock.fill"
            }
            return KeyFace(
                systemImage: image,
                accessibilityLabel: strings.keysShift,
                accessibilityValue: shift.accessibilityValue(strings),
                capsLockActionLabel: strings.keysCapsLock,
                isSpecial: true,
                isSelected: shift != .off
            )
        case .delete:
            return KeyFace(systemImage: "delete.left", accessibilityLabel: strings.keysDelete, isSpecial: true)
        case .space:
            return KeyFace(title: strings.keysSpace, accessibilityLabel: strings.keysSpace)
        case .returnKey:
            let label = returnKind.label(strings)
            return KeyFace(
                title: label,
                accessibilityLabel: label,
                isSpecial: true,
                isProminent: returnKind.isProminent && returnEnabled,
                isEnabled: returnEnabled
            )
        case .nextKeyboard:
            return KeyFace(systemImage: "globe", accessibilityLabel: strings.nextKeyboard, isSpecial: true)
        case .switchPage(let target):
            let label: String
            switch target {
            case .letters: label = strings.keysLetters
            case .numbers: label = strings.keysNumbers
            case .symbols: label = strings.keysMoreSymbols
            }
            return KeyFace(title: KeyboardLayouts.pageKeyLabel(target), accessibilityLabel: label, isSpecial: true)
        }
    }
}
