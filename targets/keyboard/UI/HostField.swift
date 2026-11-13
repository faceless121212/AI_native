import Foundation
import UIKit

/// Maps the host field's UIKit traits to the UIKit-free Core enums.
/// `UITextDocumentProxy` exposes the traits as optionals (they are optional protocol members).
enum HostField {
    static func autocapitalization(_ type: UITextAutocapitalizationType?) -> AutocapitalizationMode {
        guard let type else { return .sentences }
        switch type {
        case .none: return .none
        case .words: return .words
        case .sentences: return .sentences
        case .allCharacters: return .allCharacters
        @unknown default: return .sentences
        }
    }

    static func fieldKind(_ type: UIKeyboardType?) -> TextFieldKind {
        guard let type else { return .text }
        switch type {
        case .URL: return .url
        case .emailAddress: return .email
        case .webSearch: return .webSearch
        case .numbersAndPunctuation, .numberPad, .phonePad, .namePhonePad, .decimalPad, .asciiCapableNumberPad:
            return .numeric
        case .default, .asciiCapable, .twitter: return .text
        @unknown default: return .text
        }
    }

    static func returnKind(_ type: UIReturnKeyType?) -> ReturnKeyKind {
        ReturnKeyKind.from(uiReturnKeyTypeRawValue: type?.rawValue ?? 0)
    }
}
