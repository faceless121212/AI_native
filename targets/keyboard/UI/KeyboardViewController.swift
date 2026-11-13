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
/// double-space (kept as a hash, `SpaceMark`) and word delete, in local variables.
///
/// Memory (docs/architecture.md §10): one `UIHostingController` and one `KeyboardModel`, created
/// once in `viewDidLoad`; key presses only change published values. No images except SF Symbols.
final class KeyboardViewController: UIInputViewController, KeyboardActionHandler {
    private var model: KeyboardModel?
    private var hostingController: UIHostingController<KeyboardRootView>?
    private var heightConstraint: NSLayoutConstraint?

    private var shiftMachine = ShiftStateMachine()
    /// Set right after our own space; nil after any other edit. See DoubleSpacePeriod.
    private var lastSpaceMark: SpaceMark?
    private var fieldKind: TextFieldKind = .text
    private var fullAccess = false
    /// PrimaryLanguage from Info.plist, read before we start setting `primaryLanguage`.
    private var infoPlistPrimaryLanguage: String?
    /// Values read from the App Group and keychain on open (so cursor moves don't re-read them).
    private var aiEnabled: Bool?
    private var hasDeviceKey = false
    /// Last bar message VoiceOver actually announced in this open.
    private var announcedMessage: BarMessage?

    private var deleteTask: Task<Void, Never>?
    /// Rolling typing bookkeeping (Core/KeyPressTracker.swift).
    private var tracker = KeyPressTracker()

    private lazy var haptics = UIImpactFeedbackGenerator(style: .light)

    private var assistiveTechnologyRunning: Bool {
        UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning
    }

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
        infoPlistPrimaryLanguage = primaryLanguage

        let deviceLanguage = KeyboardLanguageResolver.deviceLanguage(
            preferredLanguages: Locale.preferredLanguages,
            primaryLanguage: infoPlistPrimaryLanguage
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
        tracker.reset()
        lastSpaceMark = nil
        // The next open announces its bar message again.
        announcedMessage = nil
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        model?.setShowsNextKeyboard(needsInputModeSwitchKey)
        updateHeight()
    }

    /// Text size or orientation changed while the keyboard is open: recompute the bar height.
    /// (Not deprecated for the iOS 16.4 deployment target; still called on iOS 17+.)
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
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
        // lastSpaceMark is deliberately NOT reset here: the mark itself detects cursor moves.
        let previousKind = fieldKind
        updateHostTraits()
        if fieldKind != previousKind {
            changePage(to: fieldKind == .numeric ? .numbers : .letters)
        }
        updateBar()
        updateHeight()
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
            primaryLanguage: infoPlistPrimaryLanguage
        )
        let uiLanguage = KeyboardLanguageResolver.uiLanguage(
            appGroupUILang: store?.string(.uiLang),
            preferredLanguages: preferred,
            primaryLanguage: infoPlistPrimaryLanguage
        )
        model.configure(language: language, strings: KeyboardStrings.forLanguage(uiLanguage))
        // Hosts use this for spell check and dictation (code review #5).
        primaryLanguage = language.rawValue
        // VoiceOver language for elements that don't set their own.
        view.accessibilityLanguage = uiLanguage.rawValue
        hostingController?.view.accessibilityLanguage = uiLanguage.rawValue

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

        tracker.reset()
        lastSpaceMark = nil
        shiftMachine = ShiftStateMachine()
        updateHostTraits()
        changePage(to: fieldKind == .numeric ? .numbers : .letters)
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

    // MARK: - VoiceOver announcements

    /// VoiceOver reads a bar message once per open when it appears (not on every cursor move).
    private func announceIfNeeded(_ message: BarMessage?) {
        guard let message, message != announcedMessage, UIAccessibility.isVoiceOverRunning else { return }
        Task { @MainActor [weak self] in
            // Let VoiceOver finish announcing the keyboard switch first.
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard let self, let model = self.model, model.barMessage == message, self.announcedMessage != message else { return }
            self.announce(message.spokenText)
            self.announcedMessage = message
        }
    }

    /// Queued behind what VoiceOver is saying, in the keyboard's UI language.
    private func announce(_ text: String) {
        guard UIAccessibility.isVoiceOverRunning else { return }
        let language = model?.speechLanguage ?? SupportedLanguage.fallback.rawValue
        let attributed = NSAttributedString(
            string: text,
            attributes: [
                .accessibilitySpeechQueueAnnouncement: true,
                .accessibilitySpeechLanguage: language,
            ]
        )
        UIAccessibility.post(notification: .announcement, argument: attributed)
    }

    private func announceShiftState() {
        guard let model, UIAccessibility.isVoiceOverRunning else { return }
        announce(shiftMachine.state.accessibilityValue(model.strings))
    }

    // MARK: - Layout state

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

    /// Every page change goes through here: a key held on the old page is committed there first
    /// (its view is about to go away), stale bookkeeping is dropped, VoiceOver re-reads the layout.
    private func changePage(to page: KeyboardPage) {
        guard let model, page != model.page else { return }
        if let held = tracker.pageWillChange() {
            commit(held, autoSwitchPage: false)
        }
        if model.setPage(page) {
            if page == .letters { updateAutocapitalization() }
            if UIAccessibility.isVoiceOverRunning {
                UIAccessibility.post(notification: .layoutChanged, argument: nil)
            }
        }
    }

    private func updateHeight() {
        guard let model else { return }
        let compact = traitCollection.verticalSizeClass == .compact
        model.setCompactHeight(compact)
        let bar = barHeight(for: model.barMessage, compact: compact)
        model.setBarTextMayShrink(bar.capped)
        let total = KeyboardMetrics.keyboardHeight(
            rowCount: model.layout.rows.count,
            compactHeight: compact,
            barHeight: Double(bar.height)
        )
        model.setHeights(bar: bar.height, keys: CGFloat(total) - bar.height)
        if let heightConstraint, heightConstraint.constant != CGFloat(total) {
            heightConstraint.constant = CGFloat(total)
        }
    }

    /// Portrait with a message: measure the bar's own (localised) strings at the bar's width with
    /// Dynamic Type capped at AX1, like BarView. Otherwise the line-count estimate.
    private func barHeight(for message: BarMessage?, compact: Bool) -> (height: CGFloat, capped: Bool) {
        let category = traitCollection.preferredContentSizeCategory
        let capped: UIContentSizeCategory = category > .accessibilityMedium ? .accessibilityMedium : category
        let traits = UITraitCollection(preferredContentSizeCategory: capped)
        let width = view.bounds.width - 2 * CGFloat(KeyboardMetrics.barHorizontalPadding)

        guard let message, !compact, width > 100 else {
            let defaultTraits = UITraitCollection(preferredContentSizeCategory: .large)
            let current = UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: traits).pointSize
            let standard = UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: defaultTraits).pointSize
            let scale = standard > 0 ? current / standard : 1
            let lines = message?.lineCount ?? 2
            let height = KeyboardMetrics.barHeight(lines: lines, fontScale: Double(scale), compactHeight: compact)
            return (CGFloat(height), compact)
        }

        var textHeight = Self.height(
            of: message.text,
            font: UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: traits),
            width: width
        )
        if message.showsDetail(compactHeight: compact), let detail = message.detail {
            textHeight += CGFloat(KeyboardMetrics.barLineSpacing) + Self.height(
                of: detail,
                font: UIFont.preferredFont(forTextStyle: .caption1, compatibleWith: traits),
                width: width
            )
        }
        let result = KeyboardMetrics.barHeight(measuredTextHeight: Double(textHeight))
        return (CGFloat(result.height), result.capped)
    }

    private static func height(of text: String, font: UIFont, width: CGFloat) -> CGFloat {
        let rect = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font],
            context: nil
        )
        return ceil(rect.height)
    }

    // MARK: - KeyboardActionHandler

    func keyDown(_ action: KeyAction) {
        if case .returnKey = action, !(model?.returnEnabled ?? true) { return }
        playFeedback()
        // A key still held by the other thumb is committed first, like the system keyboard.
        // No automatic page switch for it: this key is still under a finger.
        if let early = tracker.keyDown(action) {
            commit(early, autoSwitchPage: false)
        }
        switch action {
        case .delete:
            startDeleting()
        case .shift:
            tapShift()
        case .character, .space, .returnKey, .nextKeyboard, .switchPage:
            break
        }
    }

    func keyUp(_ action: KeyAction) {
        let shouldCommit = tracker.keyUp(action)
        switch action {
        case .character, .space, .returnKey:
            if shouldCommit { commit(action, autoSwitchPage: true) }
        case .delete:
            stopDeleting()
        case .switchPage(let page):
            changePage(to: page)
        case .shift, .nextKeyboard:
            break
        }
    }

    func keyCancelled(_ action: KeyAction) {
        tracker.keyCancelled(action)
        if case .delete = action { stopDeleting() }
    }

    func shouldShowAlternatives(for action: KeyAction) -> Bool {
        tracker.shouldShowAlternatives(for: action)
    }

    func insertAlternative(_ text: String) {
        insert(text, autoSwitchPage: true)
    }

    func toggleCapsLock() {
        shiftMachine.setCapsLock(shiftMachine.state != .capsLock)
        model?.setShift(shiftMachine.state)
        announceShiftState()
    }

    func activate(_ action: KeyAction) {
        playFeedback()
        switch action {
        case .character, .space, .returnKey:
            commit(action, autoSwitchPage: true)
        case .delete:
            deleteOnce(unit: .character)
        case .shift:
            tapShift()
        case .switchPage(let page):
            changePage(to: page)
        case .nextKeyboard:
            advanceToNextInputMode()
        }
    }

    // MARK: - Editing

    private func tapShift() {
        shiftMachine.tapShift(
            at: ProcessInfo.processInfo.systemUptime,
            window: ShiftStateMachine.window(assistiveTechnologyRunning: assistiveTechnologyRunning)
        )
        model?.setShift(shiftMachine.state)
        announceShiftState()
    }

    /// Commits a key that inserts on release.
    private func commit(_ action: KeyAction, autoSwitchPage: Bool) {
        switch action {
        case .character(let base):
            let shifted = (model?.page ?? .letters) == .letters && shiftMachine.state.isUppercase
            insert(KeyCase.apply(base, shifted: shifted), autoSwitchPage: autoSwitchPage)
        case .space:
            insertSpace(autoSwitchPage: autoSwitchPage)
        case .returnKey:
            insertReturn()
        case .shift, .delete, .nextKeyboard, .switchPage:
            break
        }
    }

    private func insert(_ text: String, autoSwitchPage: Bool) {
        textDocumentProxy.insertText(text)
        lastSpaceMark = nil
        shiftMachine.didInsertCharacter()
        switchPageAfterInserting(text, allowed: autoSwitchPage)
        updateAutocapitalization()
    }

    private func insertSpace(autoSwitchPage: Bool) {
        let proxy = textDocumentProxy
        let context = proxy.documentContextBeforeInput
        if DoubleSpacePeriod.shouldInsertPeriod(
            contextBefore: context,
            previousSpace: lastSpaceMark,
            fieldKind: fieldKind
        ) {
            proxy.deleteBackward()
            proxy.insertText(". ")
            lastSpaceMark = nil
        } else {
            let mark = SpaceMark(contextBeforeSpace: context)
            proxy.insertText(" ")
            lastSpaceMark = mark
        }
        switchPageAfterInserting(" ", allowed: autoSwitchPage)
        updateAutocapitalization()
    }

    private func switchPageAfterInserting(_ text: String, allowed: Bool) {
        guard allowed, let model else { return }
        let next = KeyboardLayouts.pageAfterInserting(text, on: model.page, otherKeyHeld: tracker.isKeyPending)
        changePage(to: next)
    }

    private func insertReturn() {
        guard model?.returnEnabled ?? true else { return }
        textDocumentProxy.insertText("\n")
        lastSpaceMark = nil
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
        lastSpaceMark = nil
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
