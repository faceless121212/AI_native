// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Touch bookkeeping for rolling (two-thumb) typing. The system keyboard commits a held key as soon
// as the next key goes down, so fast typing keeps its order. KeyboardViewController feeds every
// key-down / key-up / cancel through this and does only what it returns.

import Foundation

public struct KeyPressTracker: Sendable, Equatable {
    /// The key that is down and will insert on release (character, space or return).
    public private(set) var pending: KeyAction?
    /// Keys that are still down but were already committed by a later key-down. Their release
    /// must not insert again.
    public private(set) var committedEarly: Set<KeyAction> = []

    public init() {}

    /// Keys that insert text when the finger lifts.
    public static func commitsOnRelease(_ action: KeyAction) -> Bool {
        switch action {
        case .character, .space, .returnKey: return true
        case .shift, .delete, .nextKeyboard, .switchPage: return false
        }
    }

    /// True while a key that will still insert is held (used to hold back the automatic page
    /// switch until no key is under a finger).
    public var isKeyPending: Bool { pending != nil }

    /// A key went down. Returns the previously held key to commit now, if any.
    public mutating func keyDown(_ action: KeyAction) -> KeyAction? {
        var early: KeyAction?
        if let held = pending, held != action {
            early = held
            committedEarly.insert(held)
        }
        pending = Self.commitsOnRelease(action) ? action : nil
        committedEarly.remove(action)
        return early
    }

    /// A key was released. True when it should be committed now. A release we don't know about
    /// (its press was cleared by a page change) never inserts.
    public mutating func keyUp(_ action: KeyAction) -> Bool {
        if pending == action {
            pending = nil
            return true
        }
        committedEarly.remove(action)
        return false
    }

    /// The system cancelled the touch: nothing is inserted.
    public mutating func keyCancelled(_ action: KeyAction) {
        if pending == action { pending = nil }
        committedEarly.remove(action)
    }

    /// The long-press popup wants to open for `action`. Only when that key is still the pending
    /// one; then the popup decides what to insert and the key itself won't.
    public mutating func shouldShowAlternatives(for action: KeyAction) -> Bool {
        guard pending == action else { return false }
        pending = nil
        return true
    }

    /// Call before the page changes. Keys of the old page lose their views, so their releases
    /// never arrive: returns the pending key (to commit on the old page, it was pressed there)
    /// and forgets everything, so nothing stale is inserted or swallowed later.
    public mutating func pageWillChange() -> KeyAction? {
        let held = pending
        pending = nil
        committedEarly.removeAll()
        return held
    }

    /// The keyboard went away.
    public mutating func reset() {
        pending = nil
        committedEarly.removeAll()
    }
}
