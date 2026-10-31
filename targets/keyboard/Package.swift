// swift-tools-version:5.9
// SwiftPM manifest over Core/ + Tests/ so `swift test --package-path targets/keyboard` runs the
// keyboard's pure logic on macOS. Not part of the Xcode extension target: Package.swift and Tests/
// are excluded from the synchronized folder by plugins/with-keyboard-target-exclusions.js.
// UI/ is not in this package (it needs UIKit).
import PackageDescription

let package = Package(
    name: "ReplywiseKeyboardCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "ReplywiseKeyboardCore", targets: ["ReplywiseKeyboardCore"]),
    ],
    targets: [
        .target(
            name: "ReplywiseKeyboardCore",
            path: "Core"
        ),
        .testTarget(
            name: "ReplywiseKeyboardCoreTests",
            dependencies: ["ReplywiseKeyboardCore"],
            path: "Tests/ReplywiseKeyboardCoreTests"
        ),
    ]
)
