import Foundation
import SwiftUI
import UIKit

/// One key. Touch handling: a zero-distance drag gesture gives finger down (feedback, shift,
/// delete repeat) and finger up (commit), like the system keyboard which inserts on lift.
/// Holding a key with alternatives for 0.4 s opens the accent popup; sliding picks one and
/// lifting inserts it. VoiceOver gets a default action and one custom action per alternative.
@MainActor
struct KeyView: View {
    let action: KeyAction
    let face: KeyFace
    let hint: String
    weak var handler: KeyboardActionHandler?
    let width: CGFloat
    let height: CGFloat
    let alignment: AccentPopupAlignment

    static let longPressNanoseconds: UInt64 = 400_000_000
    static let horizontalGap: CGFloat = 3
    static let verticalGap: CGFloat = 5

    @State private var isPressed = false
    @State private var popup: [String] = []
    @State private var selected = 0
    @State private var lastTouchX: CGFloat = 0
    @State private var longPressTask: Task<Void, Never>?
    /// Resets to false when the system cancels the touch (onEnded is not called then).
    @GestureState private var isTouching = false

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
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(face.accessibilityLabel))
            .accessibilityAddTraits(.isKeyboardKey)
            .accessibilityAddTraits(face.isSelected ? .isSelected : [])
            .accessibilityHint(Text(face.alternatives.isEmpty ? "" : hint))
            .accessibilityAction { handler?.activate(action) }
            .accessibilityActions {
                ForEach(face.alternatives, id: \.self) { alternative in
                    Button(alternative) { handler?.insertAlternative(alternative) }
                }
            }
    }

    // MARK: - Drawing

    private var keyFace: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(background)
                .shadow(color: Color.black.opacity(0.3), radius: 0, x: 0, y: 1)
            label
        }
        .opacity(face.isEnabled ? 1 : 0.5)
    }

    @ViewBuilder
    private var label: some View {
        if let systemImage = face.systemImage {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(foreground)
        } else if let title = face.title {
            Text(title)
                .font(.system(size: title.count == 1 ? 23 : 15))
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
                        .font(.system(size: 22))
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
                x: CGFloat(AccentSelection.popupOffsetX(
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
                lastTouchX = value.location.x
                if !isPressed {
                    isPressed = true
                    handler?.keyDown(action)
                    scheduleLongPress()
                } else if !popup.isEmpty {
                    selected = selectionIndex(for: value.location.x, count: popup.count)
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
                    let index = min(max(selected, 0), popup.count - 1)
                    let text = popup[index]
                    popup = []
                    handler?.insertAlternative(text)
                }
            }
    }

    private func scheduleLongPress() {
        guard !face.alternatives.isEmpty else { return }
        longPressTask?.cancel()
        longPressTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: Self.longPressNanoseconds)
            guard !Task.isCancelled, isPressed, handler?.shouldShowAlternatives(for: action) ?? false else { return }
            let alternatives = face.alternatives
            selected = selectionIndex(for: lastTouchX, count: alternatives.count)
            popup = alternatives
        }
    }

    private func selectionIndex(for x: CGFloat, count: Int) -> Int {
        AccentSelection.index(
            touchX: Double(x),
            keyWidth: Double(width),
            cellWidth: Double(cellWidth),
            count: count,
            alignment: alignment
        )
    }

    private func cancelPress() {
        isPressed = false
        longPressTask?.cancel()
        longPressTask = nil
        popup = []
        handler?.keyCancelled(action)
    }
}

/// The globe key. UIKit on purpose: `handleInputModeList(from:with:)` needs the touched UIView
/// and the UIEvent to switch on tap and show the system keyboard list on long-press, which
/// Apple expects; a SwiftUI button could only call `advanceToNextInputMode()`.
struct NextKeyboardKey: UIViewRepresentable {
    weak var controller: UIInputViewController?
    let label: String

    func makeUIView(context: Context) -> UIButton {
        let button = UIButton(type: .system)
        let symbol = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
        button.setImage(UIImage(systemName: "globe", withConfiguration: symbol), for: .normal)
        button.tintColor = .label
        button.accessibilityLabel = label
        button.accessibilityTraits = [.keyboardKey]
        if let controller {
            button.addTarget(
                controller,
                action: #selector(UIInputViewController.handleInputModeList(from:with:)),
                for: .allTouchEvents
            )
        }
        return button
    }

    func updateUIView(_ button: UIButton, context: Context) {
        if button.accessibilityLabel != label {
            button.accessibilityLabel = label
        }
    }
}
