import Foundation
import MetricKit

/// MetricKit subscriber in the keyboard process (docs/architecture.md §10, agent rules: crash data).
/// Writes each diagnostic payload (crashes, hangs, CPU / disk exceptions) as MetricKit's own JSON
/// into <App Group>/Diagnostics/, keeping at most `DiagnosticsFiles.maxFiles`. The app uploads them.
/// Payloads contain call stacks and metadata only; the keyboard never adds text to them.
/// Only started with Full Access (the App Group container is unavailable without it).
final class DiagnosticsSubscriber: NSObject, MXMetricManagerSubscriber {
    private let directory: URL

    private init(directory: URL) {
        self.directory = directory
        super.init()
    }

    /// One subscriber per extension process, even though iOS may create a new view controller
    /// for each keyboard open.
    @MainActor private static var shared: DiagnosticsSubscriber?

    @MainActor static func startIfNeeded(containerURL: URL) {
        guard shared == nil else { return }
        let subscriber = DiagnosticsSubscriber(
            directory: containerURL.appendingPathComponent(DiagnosticsFiles.directoryName, isDirectory: true)
        )
        MXMetricManager.shared.add(subscriber)
        shared = subscriber
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let fileManager = FileManager.default
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return
        }
        let kept = Array(payloads.suffix(DiagnosticsFiles.maxFiles))
        let existing = (try? fileManager.contentsOfDirectory(atPath: directory.path)) ?? []
        for name in DiagnosticsFiles.filesToPrune(existing: existing, adding: kept.count) {
            try? fileManager.removeItem(at: directory.appendingPathComponent(name))
        }
        let now = Date()
        for (index, payload) in kept.enumerated() {
            let url = directory.appendingPathComponent(DiagnosticsFiles.fileName(date: now, sequence: index))
            try? payload.jsonRepresentation().write(to: url, options: [.atomic])
        }
    }
}
