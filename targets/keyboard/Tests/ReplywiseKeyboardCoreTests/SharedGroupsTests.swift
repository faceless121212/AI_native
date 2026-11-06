import XCTest
@testable import ReplywiseKeyboardCore

/// The runtime group names must match config/app-groups.js (also checked from Jest in
/// src/__tests__/keyboard-groups.test.ts).
final class SharedGroupsTests: XCTestCase {
    func testProductionNames() {
        XCTAssertEqual(SharedGroups.appBundleID(fromExtensionBundleID: "app.replywise.keyboard"), "app.replywise")
        XCTAssertEqual(SharedGroups.appGroup(forExtensionBundleID: "app.replywise.keyboard"), "group.app.replywise.shared")
        XCTAssertEqual(
            SharedGroups.sharedKeychainGroup(teamPrefix: "ABCDE12345.", appBundleID: "app.replywise"),
            "ABCDE12345.app.replywise.shared"
        )
    }

    func testStagingStaysSeparate() {
        XCTAssertEqual(
            SharedGroups.appGroup(forExtensionBundleID: "app.replywise.staging.keyboard"),
            "group.app.replywise.staging.shared"
        )
        XCTAssertEqual(SharedGroups.appGroup(forAppBundleID: "app.replywise.staging"), "group.app.replywise.staging.shared")
        XCTAssertNotEqual(
            SharedGroups.appGroup(forExtensionBundleID: "app.replywise.staging.keyboard"),
            SharedGroups.appGroup(forExtensionBundleID: "app.replywise.keyboard")
        )
    }

    func testRejectsBundleIDsThatAreNotTheKeyboard() {
        XCTAssertNil(SharedGroups.appBundleID(fromExtensionBundleID: "app.replywise"))
        XCTAssertNil(SharedGroups.appBundleID(fromExtensionBundleID: ".keyboard"))
        XCTAssertNil(SharedGroups.appGroup(forExtensionBundleID: "app.replywise.keyboards"))
    }

    func testTeamPrefixFromInfoPlist() {
        XCTAssertEqual(SharedGroups.normalizedTeamPrefix("ABCDE12345."), "ABCDE12345.")
        XCTAssertEqual(SharedGroups.normalizedTeamPrefix("ABCDE12345"), "ABCDE12345.")
        XCTAssertEqual(SharedGroups.normalizedTeamPrefix(" ABCDE12345. "), "ABCDE12345.")
        // Unsigned builds leave it empty; a missing build setting leaves the literal.
        XCTAssertNil(SharedGroups.normalizedTeamPrefix(""))
        XCTAssertNil(SharedGroups.normalizedTeamPrefix("$(AppIdentifierPrefix)"))
        XCTAssertNil(SharedGroups.normalizedTeamPrefix("abcde12345."))
        XCTAssertNil(SharedGroups.normalizedTeamPrefix("ABCDE1234."))
        XCTAssertNil(SharedGroups.normalizedTeamPrefix(nil))
    }

    func testTeamPrefixFromAccessGroup() {
        XCTAssertEqual(SharedGroups.teamPrefix(fromAccessGroup: "ABCDE12345.app.replywise"), "ABCDE12345.")
        XCTAssertEqual(SharedGroups.teamPrefix(fromAccessGroup: "ABCDE12345.app.replywise.shared"), "ABCDE12345.")
        XCTAssertNil(SharedGroups.teamPrefix(fromAccessGroup: "app.replywise"))
        XCTAssertNil(SharedGroups.teamPrefix(fromAccessGroup: ""))
    }

    func testDeviceKeyItemNames() {
        // Same strings as modules/keyboard-bridge/ios/BridgeGroups.swift.
        XCTAssertEqual(DeviceKeyKeychain.service, "app.replywise.device-key")
        XCTAssertEqual(DeviceKeyKeychain.account, "v1.deviceKey")
    }
}
