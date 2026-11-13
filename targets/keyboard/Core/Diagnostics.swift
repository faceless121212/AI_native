// Pure logic: no UIKit import, so `swift test` runs on macOS.
// File naming and pruning for MetricKit diagnostic payloads that the keyboard writes to the
// App Group (UI/DiagnosticsSubscriber.swift). The app uploads and deletes them (later prompt).
// Payloads are MetricKit's own JSON (call stacks, exception types, hang and crash metadata);
// the keyboard never adds text, and no exception we raise carries user text.

import Foundation

public enum DiagnosticsFiles {
    /// Folder inside the App Group container.
    public static let directoryName = "Diagnostics"
    /// At most this many payload files are kept; older ones are deleted on each write.
    public static let maxFiles = 20

    /// "keyboard-diagnostic-0001762164900123.json": fixed-width milliseconds, so sorting the
    /// names sorts by time. `sequence` keeps several payloads of one delivery apart.
    public static func fileName(date: Date, sequence: Int) -> String {
        let millis = max(Int64(date.timeIntervalSince1970 * 1000), 0)
        return "keyboard-diagnostic-\(padded(millis, width: 16))-\(sequence).json"
    }

    public static func isPayloadFile(_ name: String) -> Bool {
        name.hasPrefix("keyboard-diagnostic-") && name.hasSuffix(".json")
    }

    /// Names to delete so that `maxFiles` remain after adding `adding` new files (oldest first).
    public static func filesToPrune(existing: [String], adding: Int = 0, keep: Int = maxFiles) -> [String] {
        let payloads = existing.filter(isPayloadFile).sorted()
        let excess = payloads.count + max(adding, 0) - max(keep, 0)
        guard excess > 0 else { return [] }
        return Array(payloads.prefix(min(excess, payloads.count)))
    }

    static func padded(_ value: Int64, width: Int) -> String {
        let digits = String(value)
        return digits.count >= width ? digits : String(repeating: "0", count: width - digits.count) + digits
    }
}
