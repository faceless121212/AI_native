import Foundation
import SwiftUI
import UIKit

/// The single SwiftUI root hosted by `KeyboardViewController` (created once, never re-created).
/// Strings come from Core/Strings.generated.swift (same module in the extension; no import needed).
@MainActor
struct KeyboardRootView: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 0) {
            BarView(
                message: model.barMessage,
                appName: model.strings.appName,
                compactHeight: model.compactHeight,
                textMayShrink: model.barTextMayShrink
            )
            .frame(height: model.barHeight)
            KeysView(model: model)
                .frame(height: model.keysHeight)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        // Lets SwiftUI speak labels in the keyboard's UI language (best effort; the controller
        // also sets accessibilityLanguage on the hosting view and on announcements).
        .environment(\.locale, Locale(identifier: model.speechLanguage))
    }
}

/// The reply bar above the keys. Prompt 5: only the state message (spec §3.5). Reply and Polish
/// arrive in Prompt 6.
/// - Opaque `surface` background, so the tested token pairs (text and textSecondary on surface,
///   src/theme/__tests__/tokens.test.ts) apply instead of the translucent keyboard material.
/// - Follows Dynamic Type up to .accessibility1 (AX1); the controller measures the text and sizes
///   the bar to fit. Text only shrinks in landscape or when the bar hit its height cap.
/// - Landscape (compact height): message line only; VoiceOver still reads the Settings path.
@MainActor
struct BarView: View {
    let message: BarMessage?
    let appName: String
    let compactHeight: Bool
    let textMayShrink: Bool

    var body: some View {
        Group {
            if let message {
                VStack(alignment: .leading, spacing: KeyboardMetrics.barLineSpacing) {
                    Text(message.text)
                        .font(.footnote)
                        .foregroundStyle(KeyboardTheme.text)
                    if message.showsDetail(compactHeight: compactHeight), let detail = message.detail {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(KeyboardTheme.textSecondary)
                    }
                }
                .minimumScaleFactor(compactHeight || textMayShrink ? 0.6 : 1)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(message.spokenText))
            } else {
                Text(appName)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(KeyboardTheme.textSecondary)
                    .lineLimit(1)
                    .accessibilityHidden(true)
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, KeyboardMetrics.barHorizontalPadding)
        .background(KeyboardTheme.surface)
        .clipped()
    }
}

/// The key rows. One GeometryReader for the whole block; every key gets an explicit frame.
@MainActor
struct KeysView: View {
    @ObservedObject var model: KeyboardModel

    /// Space left and right of the rows.
    static let sidePadding: CGFloat = 3

    @Environment(\.legibilityWeight) private var legibilityWeight

    var body: some View {
        GeometryReader { proxy in
            let layout = model.layout
            let rowCount = max(layout.rows.count, 1)
            let rowHeight = proxy.size.height / CGFloat(rowCount)
            let maxUnits = max(layout.maxRowUnits, 1)
            let unit = max(proxy.size.width - 2 * Self.sidePadding, 0) / CGFloat(maxUnits)

            VStack(spacing: 0) {
                ForEach(layout.rows.indices, id: \.self) { rowIndex in
                    let row = layout.rows[rowIndex]
                    let flexibleWidth = max(CGFloat(maxUnits - KeyboardLayout.fixedUnits(of: row)), 0) * unit
                    HStack(spacing: 0) {
                        // Identity by key ID, so a key's press state never moves to another key
                        // when the page or shift changes.
                        ForEach(Array(row.enumerated()), id: \.element.id) { keyIndex, key in
                            keyView(
                                key,
                                width: Self.width(of: key, unit: unit, flexibleWidth: flexibleWidth),
                                height: rowHeight,
                                alignment: AccentPopupAlignment.forKey(at: keyIndex, rowCount: row.count)
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: rowHeight, maxHeight: rowHeight)
                }
            }
            .padding(.horizontal, Self.sidePadding)
        }
    }

    private static func width(of key: KeyDefinition, unit: CGFloat, flexibleWidth: CGFloat) -> CGFloat {
        switch key.width {
        case .units(let units): return CGFloat(units) * unit
        case .flexible: return flexibleWidth
        }
    }

    @ViewBuilder
    private func keyView(_ key: KeyDefinition, width: CGFloat, height: CGFloat, alignment: AccentPopupAlignment) -> some View {
        if case .nextKeyboard = key.action {
            NextKeyboardKey(
                controller: model.inputModeController,
                label: model.strings.nextKeyboard,
                speechLanguage: model.speechLanguage,
                bold: legibilityWeight == .bold
            )
                .background(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(KeyboardTheme.border)
                        .shadow(color: Color.black.opacity(0.3), radius: 0, x: 0, y: 1)
                )
                .padding(.horizontal, KeyView.horizontalGap)
                .padding(.vertical, KeyView.verticalGap)
                .frame(width: width, height: height)
        } else {
            KeyView(
                action: key.action,
                face: model.face(for: key),
                speechLanguage: model.speechLanguage,
                handler: model.handler,
                width: width,
                height: height,
                alignment: alignment
            )
        }
    }
}
