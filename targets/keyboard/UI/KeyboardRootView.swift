import SwiftUI

/// Prompt 0 placeholder: the single SwiftUI root hosted by `KeyboardViewController`.
/// Strings come from Core/Strings.generated.swift (same module in the extension; no import needed).
struct KeyboardRootView: View {
    let strings: KeyboardStrings

    var body: some View {
        HStack(spacing: 0) {
            Text(strings.appName)
                .font(.headline)
                .foregroundStyle(KeyboardTheme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}
