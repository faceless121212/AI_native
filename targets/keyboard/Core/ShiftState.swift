// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Shift and caps lock (docs/product-spec.md §3.1: "shift (double-tap caps lock)").

import Foundation

public enum ShiftState: Sendable, Equatable {
    case off
    /// Next letter upper case, then back to off.
    case on
    /// Every letter upper case until shift is tapped again.
    case capsLock

    public var isUppercase: Bool { self != .off }
}

/// Shift key state machine. Times are seconds on a monotonic clock (the caller passes
/// `ProcessInfo.processInfo.systemUptime`), so tests can drive it without waiting.
public struct ShiftStateMachine: Sendable, Equatable {
    /// Two taps closer than this turn caps lock on (the system keyboard feels like ~0.3 s).
    public static let doubleTapWindow: TimeInterval = 0.35

    public private(set) var state: ShiftState
    /// When shift was last tapped; a second tap inside the window means caps lock.
    private var lastTapAt: TimeInterval?

    public init(state: ShiftState = .off) {
        self.state = state
    }

    /// Single tap toggles shift. Two taps inside `doubleTapWindow` turn caps lock on, whether
    /// shift started off or was switched on by autocapitalise. A tap in caps lock turns it off.
    public mutating func tapShift(at time: TimeInterval) {
        if state == .capsLock {
            state = .off
            lastTapAt = nil
            return
        }
        if let previous = lastTapAt, time >= previous, time - previous <= Self.doubleTapWindow {
            state = .capsLock
            lastTapAt = nil
            return
        }
        state = state == .on ? .off : .on
        lastTapAt = time
    }

    /// After a letter (or any character) is typed: a one-shot shift goes off; caps lock stays.
    public mutating func didInsertCharacter() {
        if state == .on {
            state = .off
        }
        lastTapAt = nil
    }

    /// Applies the autocapitalise decision. Caps lock is never changed by it.
    public mutating func applyAutocapitalization(_ shouldCapitalize: Bool) {
        guard state != .capsLock else { return }
        let next: ShiftState = shouldCapitalize ? .on : .off
        if next != state {
            state = next
            lastTapAt = nil
        }
    }
}
