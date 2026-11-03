import SwiftUI
import UIKit

/// The single SwiftUI root hosted by `KeyboardViewController` (created once, never re-created).
/// Strings come from Core/Strings.generated.swift (same module in the extension; no import needed).
@MainActor
struct KeyboardRootView: View {
    @ObservedObject var model: KeyboardModel

    var body: some View {
        VStack(spacing: 0) {
            BarView(message: model.barMessage, appName: model.strings.appName)
                .frame(height: model.barHeight)
            KeysView(model: model)
                .frame(height: model.keysHeight)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// The reply bar above the keys. Prompt 5: only the state message (spec §3.5). Reply and Polish
/// arrive in Prompt 6. Follows Dynamic Type up to .accessibility1, then shrinks to fit.
@MainActor
struct BarView: View {
    let message: BarMessage?
    let appName: String

    var body: some View {
        Group {
            if let message {
                VStack(alignment: .leading, spacing: 2) {
                    Text(message.text)
                        .font(.footnote)
                        .foregroundStyle(KeyboardTheme.text)
                    if let detail = message.detail {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(KeyboardTheme.textSecondary)
                    }
                }
                .minimumScaleFactor(0.6)
                .accessibilityElement(children: .combine)
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
        .padding(.horizontal, 10)
        .clipped()
    }
}

/// The key rows. One GeometryReader for the whole block; every key gets an explicit frame.
@MainActor
struct KeysView: View {
    @ObservedObject var model: KeyboardModel

    /// Space left and right of the rows.
    static let sidePadding: CGFloat = 3

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
            NextKeyboardKey(controller: model.inputModeController, label: model.strings.nextKeyboard)
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
                hint: model.strings.keysAlternativesHint,
                handler: model.handler,
                width: width,
                height: height,
                alignment: alignment
            )
        }
    }
}
