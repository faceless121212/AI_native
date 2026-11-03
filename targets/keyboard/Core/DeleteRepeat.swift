// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Delete key repeat (docs/product-spec.md §3.1: "delete with repeat (accelerates after 0.5 s)").
//
// Timeline while delete is held:
//   t = 0       one character on touch down
//   t = 0.5 s   repeat starts, one character every 0.1 s
//   10 repeats  faster: every 0.06 s
//   20 repeats  whole words (≈ 2 s held), like the system keyboard

import Foundation

public enum DeleteUnit: Sendable, Equatable {
    case character
    case word
}

public enum DeleteRepeat {
    public static let initialDelay: TimeInterval = 0.5
    public static let slowInterval: TimeInterval = 0.1
    public static let fastInterval: TimeInterval = 0.06
    public static let fastFromRepeat = 10
    public static let wordsFromRepeat = 20

    /// Seconds to wait before repeat number `index` (0 = the first repeat after the touch-down delete).
    public static func delay(beforeRepeat index: Int) -> TimeInterval {
        if index <= 0 { return initialDelay }
        return index < fastFromRepeat ? slowInterval : fastInterval
    }

    public static func unit(forRepeat index: Int) -> DeleteUnit {
        index >= wordsFromRepeat ? .word : .character
    }

    /// Seconds from touch down until repeat number `index` fires.
    public static func time(ofRepeat index: Int) -> TimeInterval {
        (0...max(index, 0)).reduce(0) { $0 + delay(beforeRepeat: $1) }
    }

    /// How many `deleteBackward()` calls one step needs. A word step removes trailing spaces
    /// plus the word before them; counts are grapheme clusters (what deleteBackward removes).
    /// Always at least 1, so delete still works when the host gives no context.
    public static func deleteCount(unit: DeleteUnit, contextBefore: String?) -> Int {
        guard unit == .word, let text = contextBefore, !text.isEmpty else { return 1 }
        var count = 0
        var seenWord = false
        for character in text.reversed() {
            if character.isWhitespace {
                if seenWord { break }
            } else {
                seenWord = true
            }
            count += 1
        }
        return max(count, 1)
    }
}
