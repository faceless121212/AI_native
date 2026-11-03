// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Heights of the keyboard (rows and bar). The controller sets one height constraint from these,
// so the keyboard never resizes while typing; it only changes on open, rotation or a text size change.

import Foundation

public enum KeyboardMetrics {
    /// Height of one key row including its gaps (portrait iPhone, like the system keyboard).
    public static let rowHeightRegular = 54.0
    /// Landscape iPhone (compact vertical size class).
    public static let rowHeightCompact = 40.0
    /// Vertical padding inside the bar.
    static let barPadding = 10.0
    /// One line of footnote text at the default text size.
    static let barLineHeight = 16.0
    /// Never shorter than a tappable row.
    public static let barMinHeight = 44.0
    /// Bar text follows Dynamic Type up to this scale; beyond it the text shrinks to fit
    /// (the UI caps Dynamic Type for the bar at .accessibility1).
    public static let maxBarFontScale = 1.8

    public static func rowHeight(compactHeight: Bool) -> Double {
        compactHeight ? rowHeightCompact : rowHeightRegular
    }

    /// - Parameters:
    ///   - lines: lines the current bar message needs (`BarMessage.lineCount`, 2 when there is none).
    ///   - fontScale: footnote point size at the user's text size / footnote at the default size.
    public static func barHeight(lines: Int, fontScale: Double, compactHeight: Bool) -> Double {
        let scale = min(max(fontScale, 1), maxBarFontScale)
        // Landscape has little room: never more than two lines there (text shrinks to fit).
        let usedLines = compactHeight ? min(max(lines, 1), 2) : max(lines, 1)
        let height = barPadding + Double(usedLines) * barLineHeight * scale
        return max(height, barMinHeight).rounded(.up)
    }

    public static func keyboardHeight(rowCount: Int, compactHeight: Bool, barHeight: Double) -> Double {
        Double(max(rowCount, 0)) * rowHeight(compactHeight: compactHeight) + barHeight
    }
}

/// Key press feedback (docs/product-spec.md §3.1: light haptic and click sound follow system settings).
/// - Click: `UIDevice.playInputClick()` plays only when the user has Keyboard Clicks on in
///   Settings → Sounds & Haptics, so it follows the system setting by itself.
/// - Haptic: iOS has no public API to read Settings → Sounds & Haptics → Keyboard Feedback → Haptic.
///   Feedback generators also do nothing in a keyboard extension without Full Access (to be
///   confirmed on device, docs/keyboard-manual-test.md). So: haptic only with Full Access.
public enum KeyFeedbackPolicy {
    public static func playsHaptic(hasFullAccess: Bool) -> Bool {
        hasFullAccess
    }
}
