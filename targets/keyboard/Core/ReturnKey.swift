// Pure logic: no UIKit import, so `swift test` runs on macOS.
// Return key label from the host's return key type (docs/product-spec.md §3.1).

import Foundation

/// Mirror of UIReturnKeyType (UI/ maps it, so Core stays UIKit-free).
/// google and yahoo map to `.search`; unknown future values map to `.standard`.
public enum ReturnKeyKind: Sendable, CaseIterable, Equatable {
    case standard
    case go
    case search
    case send
    case done
    case next
    case join
    case route
    case continueKey
    case emergencyCall

    /// Maps UIReturnKeyType.rawValue (default 0, go 1, google 2, join 3, next 4, route 5,
    /// search 6, send 7, yahoo 8, done 9, emergencyCall 10, continue 11).
    public static func from(uiReturnKeyTypeRawValue raw: Int) -> ReturnKeyKind {
        switch raw {
        case 1: return .go
        case 2, 6, 8: return .search
        case 3: return .join
        case 4: return .next
        case 5: return .route
        case 7: return .send
        case 9: return .done
        case 10: return .emergencyCall
        case 11: return .continueKey
        default: return .standard
        }
    }

    public func label(_ strings: KeyboardStrings) -> String {
        switch self {
        case .standard: return strings.returnKeyDefault
        case .go: return strings.returnKeyGo
        case .search: return strings.returnKeySearch
        case .send: return strings.returnKeySend
        case .done: return strings.returnKeyDone
        case .next: return strings.returnKeyNext
        case .join: return strings.returnKeyJoin
        case .route: return strings.returnKeyRoute
        case .continueKey: return strings.returnKeyContinue
        case .emergencyCall: return strings.returnKeyEmergencyCall
        }
    }

    /// The system keyboard draws every return key except the plain one in the accent colour.
    public var isProminent: Bool { self != .standard }

    /// Hosts with `enablesReturnKeyAutomatically` want return disabled while the field is empty.
    public static func isEnabled(enablesReturnKeyAutomatically: Bool, hasText: Bool) -> Bool {
        !enablesReturnKeyAutomatically || hasText
    }
}
