import Foundation
import SwiftUI
import UIKit

/// One key. Touch handling: a zero-distance drag gesture gives finger down (feedback, shift,
/// delete repeat) and finger up (commit), like the system keyboard which inserts on lift.
/// The key under the finger at touch-down is the one committed: sliding to another key is not
/// supported (docs/keyboard-manual-test.md).
///
/// Holding a key with alternatives for 0.4 s opens the popup. The key's own character sits under
/// the finger and is selected, so lifting without sliding still types it; sliding picks an
/// accent; sliding well off the popup cancels (Core/AccentMap.swift, AccentPopupLayout).
/// VoiceOver: default action types the key; accents are custom actions ("Actions available").
@MainActor
struct KeyView: View {
    let action: KeyAction
    let face: KeyFace
    /// BCP-47 tag of the keyboard's UI language, for VoiceOver announcements.
    let speechLanguage: String
    weak var handler: KeyboardActionHandler?
    let width: CGFloat
    let height: CGFloat
    let alignment: AccentPopupAlignment

    static let longPressNanoseconds: UInt64 = 400_000_000
    static let horizontalGap: CGFloat = 3
    static let verticalGap: CGFloat = 5

    @State private var isPressed = false
    /// Popup cells, base character included; empty when no popup is open.
    @State private var popup: [String] = []
    /// Selected cell, nil when the finger left the popup (lifting then inserts nothing).
    @State private var selected: Int?
    @State private var lastTouch: CGPoint = .zero
    @State private var popupOrigin: CGPoint = .zero
    @State private var longPressTask: Task<Void, Never>?
    /// Resets to false when the system cancels the touch (onEnded is not called then).
    @GestureState private var isTouching = false

    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private var cellWidth: CGFloat { min(max(width - 2 * Self.horizontalGap, 28), 40) }

    var body: some View {
        keyFace
            .padding(.horizontal, Self.horizontalGap)
            .padding(.vertical, Self.verticalGap)
            .frame(width: width, height: height)
            .contentShape(Rectangle())
            .overlay(alignment: .bottomLeading) { popupView }
            .zIndex(popup.isEmpty ? 0 : 1)
            .gesture(touchGesture)
            .onChange(of: isTouching) { touching in
                guard !touching else { return }
                // onEnded runs in the same update when the touch ends normally; only a cancelled
                // touch still has isPressed set once this hop to the main actor runs.
                Task { @MainActor in
                    guard isPressed else { return }
                    cancelPress()
                }
            }
            // Disabled return key: no touches, no click, and VoiceOver says "dimmed".
            .disabled(!face.isEnabled)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(face.accessibilityLabel))
            .accessibilityValue(Text(face.accessibilityValue ?? ""))
            .accessibilityAddTraits(.isKeyboardKey)
            .accessibilityAddTraits(face.isSelected ? .isSelected : [])
            .accessibilityAction { handler?.activate(action) }
            .accessibilityActions {
                if let capsLockLabel = face.capsLockActionLabel {
                    Button(capsLockLabel) { handler?.toggleCapsLock() }
                }
                ForEach(face.alternatives, id: \.self) { alternative in
                    Button(alternative) { handler?.insertAlternative(alternative) }
                }
            }
    }

    // MARK: - Drawing

    private var symbolWeight: Font.Weight {
        legibilityWeight == .bold ? .semibold : .regular
    }

    private var keyFace: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(background)
                .shadow(color: Color.black.opacity(0.3), radius: 0, x: 0, y: 1)
            if colorSchemeContrast == .increased {
                // Increase Contrast: every key gets a visible edge.
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(KeyboardTheme.borderStrong, lineWidth: 1)
            }
            label
        }
        .opacity(face.isEnabled ? 1 : 0.5)
    }

    @ViewBuilder
    private var label: some View {
        if let systemImage = face.systemImage {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: symbolWeight))
                .foregroundStyle(foreground)
        } else if let title = face.title {
            Text(title)
                .font(.system(size: title.count == 1 ? 23 : 15, weight: legibilityWeight == .bold ? .semibold : .regular))
                .foregroundStyle(foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 2)
        }
    }

    private var background: Color {
        if face.isProminent { return isPressed ? KeyboardTheme.surfaceRaised : KeyboardTheme.accent }
        if face.isSpecial { return isPressed ? KeyboardTheme.surfaceRaised : KeyboardTheme.border }
        return isPressed ? KeyboardTheme.border : KeyboardTheme.surfaceRaised
    }

    private var foreground: Color {
        face.isProminent && !isPressed ? KeyboardTheme.onAccent : KeyboardTheme.text
    }

    @ViewBuilder
    private var popupView: some View {
        if !popup.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(popup.enumerated()), id: \.offset) { index, text in
                    Text(text)
                        .font(.system(size: 22, weight: legibilityWeight == .bold ? .semibold : .regular))
                        .foregroundStyle(index == selected ? KeyboardTheme.onAccent : KeyboardTheme.text)
                        .frame(width: cellWidth, height: height - Self.verticalGap)
                        .background(
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(index == selected ? KeyboardTheme.accent : Color.clear)
                        )
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(KeyboardTheme.surfaceRaised)
                    .shadow(color: Color.black.opacity(0.3), radius: 3, x: 0, y: 1)
            )
            .offset(
                x: CGFloat(AccentPopupLayout.offsetX(
                    keyWidth: Double(width),
                    cellWidth: Double(cellWidth),
                    count: popup.count,
                    alignment: alignment
                )),
                y: -height
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    // MARK: - Touch

    private var touchGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .updating($isTouching) { _, state, _ in
                state = true
            }
            .onChanged { value in
                lastTouch = value.location
                if !isPressed {
                    isPressed = true
                    handler?.keyDown(action)
                    scheduleLongPress()
                } else if !popup.isEmpty {
                    let next = AccentPopupLayout.selection(
                        dx: Double(value.location.x - popupOrigin.x),
                        dy: Double(value.location.y - popupOrigin.y),
                        cellWidth: Double(cellWidth),
                        rowHeight: Double(height),
                        count: popup.count,
                        alignment: alignment
                    )
                    if next != selected {
                        selected = next
                        announceSelection()
                    }
                }
            }
            .onEnded { _ in
                guard isPressed else { return }
                isPressed = false
                longPressTask?.cancel()
                longPressTask = nil
                if popup.isEmpty {
                    handler?.keyUp(action)
                } else {
                    let items = popup
                    let choice = selected
                    popup = []
                    selected = nil
                    if let choice, items.indices.contains(choice) {
                        handler?.insertAlternative(items[choice])
                    }
                }
            }
    }

    private func scheduleLongPress() {
        guard !face.alternatives.isEmpty, let base = face.title else { return }
        longPressTask?.cancel()
        longPressTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: Self.longPressNanoseconds)
            guard !Task.isCancelled, isPressed, handler?.shouldShowAlternatives(for: action) ?? false else { return }
            let items = AccentPopupLayout.items(base: base, alternatives: face.alternatives, alignment: alignment)
            popupOrigin = lastTouch
            selected = AccentPopupLayout.baseIndex(count: items.count, alignment: alignment)
            popup = items
        }
    }

    /// VoiceOver users sliding in the popup hear the selected character.
    private func announceSelection() {
        guard UIAccessibility.isVoiceOverRunning, let selected, popup.indices.contains(selected) else { return }
        let text = NSAttributedString(
            string: popup[selected],
            attributes: [.accessibilitySpeechLanguage: speechLanguage]
        )
        UIAccessibility.post(notification: .announcement, argument: text)
    }

    private func cancelPress() {
        isPressed = false
        longPressTask?.cancel()
        longPressTask = nil
        popup = []
        selected = nil
        handler?.keyCancelled(action)
    }
}

/// The globe key. UIKit on purpose: `handleInputModeList(from:with:)` needs the touched UIView
/// and the UIEvent to switch on tap and show the system keyboard list on long-press, which
/// Apple expects; a SwiftUI button could only call `advanceToNextInputMode()`.
struct NextKeyboardKey: UIViewRepresentable {
    weak var controller: UIInputViewController?
    let label: String
    let speechLanguage: String
    /// Bold Text is on (Settings → Accessibility → Display & Text Size).
    let bold: Bool

    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        button.tintColor = .label
        button.accessibilityTraits = [.keyboardKey]
        if let controller {
            button.addTarget(
                controller,
                action: #selector(UIInputViewController.handleInputModeList(from:with:)),
                for: .allTouchEvents
            )
        }
        configure(button)
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        configure(button)
    }

    private func configure(_ button: UIButton) {
        let symbol = UIImage.SymbolConfiguration(pointSize: 18, weight: bold ? .semibold : .regular)
        button.setImage(UIImage(systemName: "globe", withConfiguration: symbol), for: .normal)
        if button.accessibilityLabel != label { button.accessibilityLabel = label }
        if button.accessibilityLanguage != speechLanguage { button.accessibilityLanguage = speechLanguage }
    }
}
