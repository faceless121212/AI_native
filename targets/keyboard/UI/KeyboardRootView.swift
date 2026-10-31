import SwiftUI

/// Prompt 0 placeholder: the single SwiftUI root hosted by `KeyboardViewController`.
/// Strings come from Core/Strings.swift (same module in the extension target; no import needed).
struct KeyboardRootView: View {
    var body: some View {
        HStack(spacing: 0) {
            Text(Strings.placeholderTitle)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}
