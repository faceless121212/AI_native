import SwiftUI
import UIKit

/// Principal class of the keyboard extension
/// (Info.plist NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).KeyboardViewController).
///
/// Prompt 0 placeholder: one row with the globe key and the "Replywise" title. The real layout,
/// bar state machine and Full Access handling come in later prompts (docs/architecture.md §6).
///
/// Layout: a horizontal UIStackView holding
/// - the next-keyboard (globe) key as a UIKit `UIButton`. It stays UIKit on purpose:
///   `handleInputModeList(from:with:)` needs the touched `UIView` and the `UIEvent` to show the
///   system input-mode list on long-press and to switch on tap. A SwiftUI button can only call
///   `advanceToNextInputMode()`, which loses the long-press list Apple expects.
/// - one `UIHostingController` with the SwiftUI root, created exactly once in `viewDidLoad` and
///   never re-created (memory budget, docs/architecture.md §10).
final class KeyboardViewController: UIInputViewController {
    private static let rowHeight: CGFloat = 56
    private static let globeKeyWidth: CGFloat = 44

    /// UI language for now: the device's preferred language. Prompt 5 switches this to
    /// v1.uiLang from the App Group when Full Access is on.
    private let strings = KeyboardStrings.forLanguage(
        Locale.preferredLanguages.lazy.compactMap(SupportedLanguage.from(languageTag:)).first ?? .fallback
    )

    private var hostingController: UIHostingController<KeyboardRootView>?
    private let nextKeyboardButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()

        configureNextKeyboardButton()

        let hosting = UIHostingController(rootView: KeyboardRootView(strings: strings))
        hosting.view.backgroundColor = .clear
        addChild(hosting)

        let row = UIStackView(arrangedSubviews: [nextKeyboardButton, hosting.view])
        row.axis = .horizontal
        row.alignment = .fill
        row.spacing = 4
        row.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(row)

        // Slightly below required so it never fights the system's own height constraint
        // during rotation or keyboard switching.
        let height = view.heightAnchor.constraint(equalToConstant: Self.rowHeight)
        height.priority = UILayoutPriority(999)

        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
            row.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4),
            row.topAnchor.constraint(equalTo: view.topAnchor),
            row.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            nextKeyboardButton.widthAnchor.constraint(equalToConstant: Self.globeKeyWidth),
            height,
        ])

        hosting.didMove(toParent: self)
        hostingController = hosting
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // Only show the globe key when the system doesn't already offer one
        // (e.g. on devices with a system globe key below the keyboard).
        let shouldHide = !needsInputModeSwitchKey
        if nextKeyboardButton.isHidden != shouldHide {
            nextKeyboardButton.isHidden = shouldHide
        }
    }

    private func configureNextKeyboardButton() {
        let symbol = UIImage.SymbolConfiguration(textStyle: .title3)
        nextKeyboardButton.setImage(UIImage(systemName: "globe", withConfiguration: symbol), for: .normal)
        nextKeyboardButton.tintColor = .label
        nextKeyboardButton.accessibilityLabel = strings.nextKeyboard
        nextKeyboardButton.accessibilityTraits = [.button, .keyboardKey]
        // Tap switches to the next keyboard; long-press shows the system keyboard list.
        nextKeyboardButton.addTarget(
            self,
            action: #selector(handleInputModeList(from:with:)),
            for: .allTouchEvents
        )
        nextKeyboardButton.isHidden = true
    }
}
