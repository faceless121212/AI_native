// Pure logic: no UIKit import, so `swift test` runs on macOS.
// The bar's state when the keyboard opens (docs/architecture.md §6, docs/product-spec.md §3.5).
// Prompt 5 resolves only the states known before any tap; REQUESTING, OFFLINE, QUOTA_EMPTY,
// FAIR_USE, PROVIDER_DOWN and the trial banner arrive with the reply flow (Prompt 6).

import Foundation

public enum BarState: Sendable, Equatable {
    /// Secure (password) field: typing only, the bar offers nothing and shows nothing.
    case typingOnly
    /// NO_ACCESS: Full Access off. Typing works; no App Group, no network.
    case noAccess
    /// AI_OFF: no AI consent, under 18 or consent withdrawn (`v1.aiEnabled` false).
    case aiOff
    /// NOT_SET_UP: the app never wrote the App Group, or there is no device key yet.
    case notSetUp
    /// IDLE: ready for Reply / Polish.
    case idle
}

public enum BarStateResolver {
    /// - Parameters:
    ///   - hasFullAccess: `UIInputViewController.hasFullAccess`, checked on every open.
    ///   - isSecureField: the host field has `isSecureTextEntry` on.
    ///   - aiEnabled: `v1.aiEnabled` from the App Group; nil when the app never wrote it
    ///     (or Full Access is off, so the App Group can't be read).
    ///   - hasDeviceKey: the shared keychain holds the keyboard's device key.
    public static func resolve(
        hasFullAccess: Bool,
        isSecureField: Bool,
        aiEnabled: Bool?,
        hasDeviceKey: Bool
    ) -> BarState {
        if isSecureField { return .typingOnly }
        guard hasFullAccess else { return .noAccess }
        guard let aiEnabled else { return .notSetUp }
        guard aiEnabled else { return .aiOff }
        guard hasDeviceKey else { return .notSetUp }
        return .idle
    }
}

/// What the bar shows for a state: a message and, for No Full Access, the Settings path.
public struct BarMessage: Sendable, Equatable {
    public let text: String
    public let detail: String?

    /// Lines of footnote text the bar reserves (spec §3.5: the long messages wrap to two lines;
    /// No Full Access shows its two-line Settings path under the message).
    public var lineCount: Int { detail == nil ? 2 : 4 }

    /// Landscape iPhone (compact height) has room for the message only; the Settings path is
    /// still read by VoiceOver (`spokenText`).
    public func showsDetail(compactHeight: Bool) -> Bool {
        detail != nil && !compactHeight
    }

    /// Message and detail as one sentence for VoiceOver and announcements.
    public var spokenText: String {
        [text, detail].compactMap { $0 }.joined(separator: " ")
    }
}

extension BarState {
    public func message(_ strings: KeyboardStrings) -> BarMessage? {
        switch self {
        case .typingOnly, .idle: return nil
        case .noAccess: return BarMessage(text: strings.barNoFullAccess, detail: strings.barNoFullAccessPath)
        case .aiOff: return BarMessage(text: strings.barAiOff, detail: nil)
        case .notSetUp: return BarMessage(text: strings.barNotSetUp, detail: nil)
        }
    }
}
