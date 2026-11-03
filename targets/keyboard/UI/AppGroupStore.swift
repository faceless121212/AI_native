import Foundation

/// The App Group as the keyboard sees it (docs/architecture.md §5). Only created when
/// `hasFullAccess` is true: without Full Access the extension can't use the shared container,
/// and the keyboard falls back to built-in defaults instead.
/// The group name comes from the bundle ID (Core/SharedGroups.swift), never a literal.
struct AppGroupStore {
    let groupID: String
    private let defaults: UserDefaults

    static func forCurrentExtension() -> AppGroupStore? {
        guard
            let bundleID = Bundle.main.bundleIdentifier,
            let groupID = SharedGroups.appGroup(forExtensionBundleID: bundleID),
            let defaults = UserDefaults(suiteName: groupID)
        else { return nil }
        return AppGroupStore(groupID: groupID, defaults: defaults)
    }

    func bool(_ key: AppGroupKey) -> Bool? {
        defaults.object(forKey: key.rawValue) as? Bool
    }

    func string(_ key: AppGroupKey) -> String? {
        defaults.string(forKey: key.rawValue)
    }

    func set(_ value: String, for key: AppGroupKey) {
        defaults.set(value, forKey: key.rawValue)
    }

    var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)
    }
}
