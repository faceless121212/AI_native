import Foundation
import SwiftUI
import UIKit

/// Principal class of the keyboard extension
/// (Info.plist NSExtensionPrincipalClass = $(PRODUCT_MODULE_NAME).KeyboardViewController).
///
/// Typing works without Full Access and offline (CLAUDE.md rule 2): nothing here touches the
/// network, and the App Group / keychain are only read when `hasFullAccess` is true.
/// Nothing typed is stored or logged: text goes straight to `textDocumentProxy`, and the only
/// reads of `documentContextBeforeInput` are the last characters for autocapitalise,
/// double-space and word delete, kept in local variables.
///
/// Memory (docs/architecture.md §10): one `UIHostingController` and one `KeyboardModel`, created
/// once in `viewDidLoad`; key presses only change published values. No images except SF Symbols.
final class KeyboardViewController: UIInputViewController, KeyboardActionHandler {
    private var model: KeyboardModel?
    private var hostingController: UIHostingController<KeyboardRootView>?
    private var heightConstraint: NSLayoutConstraint?

    private var shiftMachine = ShiftStateMachine()
    private var previousKeyWasSpace = false
    private var fieldKind: TextFieldKind = .text
    private var fullAccess = false
    /// Values read from the App Group and keychain on open (so cursor moves don't re-read them).
    private var aiEnabled: Bool?
    private var hasDeviceKey = false
    private var announcedMessage: BarMessage?

    private var deleteTask: Task<Void, Never>?
    /// Rolling typing: a letter still under one finger is committed when the next goes down,
    /// so fast two-thumb typing keeps its order.
    private var pendingCharacter: KeyAction?
    private var committedEarly: Set<KeyAction> = []

    private lazy var haptics = UIImpactFeedbackGenerator(style: .light)

    // MARK: - Lifecycle

    override func loadView() {
        // A UIInputView subclass that adopts UIInputViewAudioFeedback, so playInputClick() works.
        let keyboardView = KeyboardInputView(frame: .zero, inputViewStyle: .keyboard)
        keyboardView.allowsSelfSizing = true
        view = keyboardView
        inputView = keyboardView
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        let deviceLanguage = KeyboardLanguageResolver.deviceLanguage(
            preferredLanguages: Locale.preferredLanguages,
            primaryLanguage: primaryLanguage
        )
        let model = KeyboardModel(language: deviceLanguage, strings: KeyboardStrings.forLanguage(deviceLanguage))
        model.handler = self
        model.inputModeController = self
        self.model = model

        let hosting = UIHostingController(rootView: KeyboardRootView(model: model))
        hosting.view.backgroundColor = .clear
        hosting.view.isMultipleTouchEnabled = true
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(hosting)
        view.addSubview(hosting.view)

        // Slightly below required so it never fights the system's own height constraint
        // during rotation or keyboard switching.
        let height = view.heightAnchor.constraint(equalToConstant: CGFloat(
            KeyboardMetrics.keyboardHeight(rowCount: 4, compactHeight: false, barHeight: KeyboardMetrics.barMinHeight)
        ))
        height.priority = UILayoutPriority(999)

        NSLayoutConstraint.activate([
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            height,
        ])

        hosting.didMove(toParent: self)
        hostingController = hosting
        heightConstraint = height
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refreshOnOpen()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopDeleting()
        pendingCharacter = nil
        committedEarly.removeAll()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        model?.setShowsNextKeyboard(needsInputModeSwitchKey)
        updateHeight()
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Prompt 5 keeps no caches (no results, no images). Stop anything running.
        stopDeleting()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        // The host moved the cursor, changed the text or focused another field.
        updateHostTraits()
        updateBar()
        updateAutocapitalization()
    }

    // MARK: - Open

    /// Runs on every open (viewWillAppear): Full Access can change between opens.
    private func refreshOnOpen() {
        guard let model else { return }
        fullAccess = hasFullAccess
        let store = fullAccess ? AppGroupStore.forCurrentExtension() : nil

        let preferred = Locale.preferredLanguages
        let language = KeyboardLanguageResolver.keyboardLanguage(
            appGroupDefaultsJSON: store?.string(.defaults),
            preferredLanguages: preferred,
            primaryLanguage: primaryLanguage
        )
        let uiLanguage = KeyboardLanguageResolver.uiLanguage(
            appGroupUILang: store?.string(.uiLang),
            preferredLanguages: preferred,
            primaryLanguage: primaryLanguage
        )
        model.configure(language: language, strings: KeyboardStrings.forLanguage(uiLanguage))

        aiEnabled = store?.bool(.aiEnabled)
        hasDeviceKey = fullAccess && SharedKeychainReader.hasDeviceKey()

        if let store {
            writeHeartbeat(to: store)
            if let container = store.containerURL {
                DiagnosticsSubscriber.startIfNeeded(containerURL: container)
            }
        }
        if fullAccess {
            haptics.prepare()
        }

        previousKeyWasSpace = false
        shiftMachine = ShiftStateMachine()
        updateHostTraits()
        model.setPage(fieldKind == .numeric ? .numbers : .letters)
        updateBar()
        updateAutocapitalization()
        updateHeight()
    }

    private func writeHeartbeat(to store: AppGroupStore) {
        let info = Bundle.main.infoDictionary
        let version = KeyboardHeartbeat.version(
            shortVersion: info?["CFBundleShortVersionString"] as? String,
            build: info?["CFBundleVersion"] as? String
        )
        let heartbeat = KeyboardHeartbeat(date: Date(), hasFullAccess: true, version: version)
        if let json = heartbeat.jsonString() {
            store.set(json, for: .keyboardHeartbeat)
        }
    }

    // MARK: - Host field

    private func updateHostTraits() {
        guard let model else { return }
        let proxy = textDocumentProxy
        fieldKind = HostField.fieldKind(proxy.keyboardType)
        model.setReturnKey(
            kind: HostField.returnKind(proxy.returnKeyType),
            enabled: ReturnKeyKind.isEnabled(
                enablesReturnKeyAutomatically: proxy.enablesReturnKeyAutomatically ?? false,
                hasText: proxy.hasText
            )
        )
        // Hosts can ask for a dark keyboard in light mode (keyboardAppearance = .dark).
        let style: UIUserInterfaceStyle = proxy.keyboardAppearance == .dark ? .dark : .unspecified
        if hostingController?.overrideUserInterfaceStyle != style {
            hostingController?.overrideUserInterfaceStyle = style
        }
    }

    private func updateBar() {
        guard let model else { return }
        let state = BarStateResolver.resolve(
            hasFullAccess: fullAccess,
            isSecureField: textDocumentProxy.isSecureTextEntry ?? false,
            aiEnabled: aiEnabled,
            hasDeviceKey: hasDeviceKey
        )
        let message = state.message(model.strings)
        model.setBarMessage(message)
        announceIfNeeded(message)
    }

    /// VoiceOver reads a bar message once when it appears (not on every cursor move).
    private func announceIfNeeded(_ message: BarMessage?) {
        defer { announcedMessage = message }
        guard let message, message != announcedMessage, UIAccessibility.isVoiceOverRunning else { return }
        let text = [message.text, message.detail].compactMap { $0 }.joined(separator: " ")
        Task { @MainActor in
            // Let VoiceOver finish announcing the keyboard switch first.
            try? await Task.sleep(nanoseconds: 600_000_000)
            UIAccessibility.post(notification: .announcement, argument: text)
        }
    }

    private func updateAutocapitalization() {
        guard let model else { return }
        let proxy = textDocumentProxy
        let should = AutoCapitalization.shouldCapitalize(
            mode: HostField.autocapitalization(proxy.autocapitalizationType),
            contextBefore: proxy.documentContextBeforeInput
        )
        shiftMachine.applyAutocapitalization(should)
        model.setShift(shiftMachine.state)
        updateReturnEnabled()
    }

    private func updateReturnEnabled() {
        guard let model else { return }
        let proxy = textDocumentProxy
        model.setReturnKey(
            kind: model.returnKind,
            enabled: ReturnKeyKind.isEnabled(
                enablesReturnKeyAutomatically: proxy.enablesReturnKeyAutomatically ?? false,
                hasText: proxy.hasText
            )
        )
    }

    private func updateHeight() {
        guard let model else { return }
        let compact = traitCollection.verticalSizeClass == .compact
        let footnote = UIFontMetrics(forTextStyle: .footnote)
        let scale = footnote.scaledValue(for: 13, compatibleWith: traitCollection) / 13
        let bar = KeyboardMetrics.barHeight(
            lines: model.barMessage?.lineCount ?? 2,
            fontScale: Double(scale),
            compactHeight: compact
        )
        let total = KeyboardMetrics.keyboardHeight(
            rowCount: model.layout.rows.count,
            compactHeight: compact,
            barHeight: bar
        )
        model.setHeights(bar: CGFloat(bar), keys: CGFloat(total - bar))
        if let heightConstraint, heightConstraint.constant != CGFloat(total) {
            heightConstraint.constant = CGFloat(total)
        }
    }

    // MARK: - KeyboardActionHandler

    func keyDown(_ action: KeyAction) {
        playFeedback()
        // Any new key commits a letter still held by the other thumb first, like the system keyboard.
        if let pending = pendingCharacter, pending != action {
            commitCharacter(pending)
            committedEarly.insert(pending)
            pendingCharacter = nil
        }
        switch action {
        case .character:
            pendingCharacter = action
        case .delete:
            startDeleting()
        case .shift:
            shiftMachine.tapShift(at: ProcessInfo.processInfo.systemUptime)
            model?.setShift(shiftMachine.state)
        case .space, .returnKey, .nextKeyboard, .switchPage:
            break
        }
    }

    func keyUp(_ action: KeyAction) {
        switch action {
        case .character:
            if pendingCharacter == action { pendingCharacter = nil }
            if committedEarly.remove(action) != nil { return }
            commitCharacter(action)
        case .delete:
            stopDeleting()
        case .space:
            insertSpace()
        case .returnKey:
            insertReturn()
        case .switchPage(let page):
            model?.setPage(page)
            if page == .letters { updateAutocapitalization() }
        case .shift, .nextKeyboard:
            break
        }
    }

    func keyCancelled(_ action: KeyAction) {
        switch action {
        case .character:
            if pendingCharacter == action { pendingCharacter = nil }
            committedEarly.remove(action)
        case .delete:
            stopDeleting()
        default:
            break
        }
    }

    func shouldShowAlternatives(for action: KeyAction) -> Bool {
        guard !committedEarly.contains(action) else { return false }
        if pendingCharacter == action { pendingCharacter = nil }
        return true
    }

    func insertAlternative(_ text: String) {
        insert(text)
    }

    func activate(_ action: KeyAction) {
        playFeedback()
        switch action {
        case .character:
            commitCharacter(action)
        case .delete:
            deleteOnce(unit: .character)
        case .shift:
            shiftMachine.tapShift(at: ProcessInfo.processInfo.systemUptime)
            model?.setShift(shiftMachine.state)
        case .space:
            insertSpace()
        case .returnKey:
            insertReturn()
        case .switchPage(let page):
            model?.setPage(page)
            if page == .letters { updateAutocapitalization() }
        case .nextKeyboard:
            advanceToNextInputMode()
        }
    }

    // MARK: - Editing

    private func commitCharacter(_ action: KeyAction) {
        guard case .character(let base) = action else { return }
        let shifted = (model?.page ?? .letters) == .letters && shiftMachine.state.isUppercase
        insert(KeyCase.apply(base, shifted: shifted))
    }

    private func insert(_ text: String) {
        textDocumentProxy.insertText(text)
        previousKeyWasSpace = false
        shiftMachine.didInsertCharacter()
        if let model {
            model.setPage(KeyboardLayouts.pageAfterInserting(text, on: model.page))
        }
        updateAutocapitalization()
    }

    private func insertSpace() {
        let proxy = textDocumentProxy
        if DoubleSpacePeriod.shouldInsertPeriod(
            contextBefore: proxy.documentContextBeforeInput,
            previousKeyWasSpace: previousKeyWasSpace,
            fieldKind: fieldKind
        ) {
            proxy.deleteBackward()
            proxy.insertText(". ")
            previousKeyWasSpace = false
        } else {
            proxy.insertText(" ")
            previousKeyWasSpace = true
        }
        if let model {
            model.setPage(KeyboardLayouts.pageAfterInserting(" ", on: model.page))
        }
        updateAutocapitalization()
    }

    private func insertReturn() {
        guard model?.returnEnabled ?? true else { return }
        textDocumentProxy.insertText("\n")
        previousKeyWasSpace = false
        updateAutocapitalization()
    }

    private func deleteOnce(unit: DeleteUnit) {
        let proxy = textDocumentProxy
        let count = DeleteRepeat.deleteCount(
            unit: unit,
            contextBefore: unit == .word ? proxy.documentContextBeforeInput : nil
        )
        for _ in 0..<count {
            proxy.deleteBackward()
        }
        previousKeyWasSpace = false
        updateAutocapitalization()
    }

    private func startDeleting() {
        deleteOnce(unit: .character)
        deleteTask?.cancel()
        deleteTask = Task { @MainActor [weak self] in
            var index = 0
            while !Task.isCancelled {
                let delay = DeleteRepeat.delay(beforeRepeat: index)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                guard !Task.isCancelled, let self else { return }
                self.playFeedback(haptic: false)
                self.deleteOnce(unit: DeleteRepeat.unit(forRepeat: index))
                index += 1
            }
        }
    }

    private func stopDeleting() {
        deleteTask?.cancel()
        deleteTask = nil
    }

    // MARK: - Feedback

    /// Click: follows the system Keyboard Clicks setting by itself. Haptic: see KeyFeedbackPolicy.
    private func playFeedback(haptic: Bool = true) {
        UIDevice.current.playInputClick()
        if haptic, KeyFeedbackPolicy.playsHaptic(hasFullAccess: fullAccess) {
            haptics.impactOccurred()
        }
    }
}
