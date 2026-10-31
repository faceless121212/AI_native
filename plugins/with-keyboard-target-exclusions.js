// Local config plugin: keeps SwiftPM-only files out of the iOS keyboard extension target.
//
// @bacons/apple-targets turns targets/keyboard/ into a PBXFileSystemSynchronizedRootGroup, so
// Xcode compiles every file in the folder into the extension. Its only membership exceptions are
// Info.plist and expo-target.config.js. Package.swift (`import PackageDescription`) and Tests/
// (`import XCTest`, `@testable import ReplywiseKeyboardCore`) would then break the extension build.
// This plugin adds them to the keyboard target's membership exceptions.
//
// ORDER MATTERS: list this plugin BEFORE "@bacons/apple-targets" in app.config.ts `plugins`.
// Expo chains mods so that the action registered first runs last; apple-targets creates the
// synchronized group in its own `xcodeProjectBeta2` mod, so registering first means we run after
// the group exists. Registering after apple-targets is impossible anyway: apple-targets adds the
// mod's base provider, and Expo rejects mods added after a provider (INVALID_MOD_ORDER).
// If the group can't be found, prebuild fails loudly instead of producing a broken project.

const fs = require('fs');
const path = require('path');
// apple-targets' own mod helper, so we hook the exact mod (and xcode project object) it writes.
const { withXcodeProjectBeta } = require('@bacons/apple-targets/build/with-bacons-xcode');

const DEFAULTS = {
  // Target folder relative to the project root.
  targetDir: 'targets/keyboard',
  // Files or folders (relative to targetDir) to exclude. Folders are expanded to every file inside.
  exclude: ['Package.swift', 'Tests'],
};

function listFiles(absDir, relDir) {
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.name !== '.DS_Store')
    .flatMap((entry) => {
      const rel = path.posix.join(relDir, entry.name);
      const abs = path.join(absDir, entry.name);
      return entry.isDirectory() ? listFiles(abs, rel) : [rel];
    });
}

function resolveExclusions(projectRoot, targetDir, exclude) {
  const root = path.join(projectRoot, targetDir);
  return exclude.flatMap((relPath) => {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) return [];
    return fs.statSync(abs).isDirectory()
      ? listFiles(abs, relPath.split(path.sep).join('/'))
      : [relPath];
  });
}

const withKeyboardTargetExclusions = (config, props = {}) => {
  const { targetDir, exclude } = { ...DEFAULTS, ...props };
  const groupPath = path.basename(targetDir);

  return withXcodeProjectBeta(config, (config) => {
    const project = config.modResults;
    const exclusions = resolveExclusions(config.modRequest.projectRoot, targetDir, exclude);

    let patched = false;
    for (const target of project.rootObject.props.targets) {
      const groups = target.props.fileSystemSynchronizedGroups || [];
      const group = groups.find(
        (g) => g.isa === 'PBXFileSystemSynchronizedRootGroup' && g.props.path === groupPath,
      );
      if (!group) continue;

      const exceptionSet = (group.props.exceptions || []).find(
        (e) =>
          e.isa === 'PBXFileSystemSynchronizedBuildFileExceptionSet' && e.props.target === target,
      );
      if (!exceptionSet) {
        throw new Error(
          `[with-keyboard-target-exclusions] No membership exception set for target "${target.props.name}" on group "${groupPath}".`,
        );
      }
      const current = exceptionSet.props.membershipExceptions || [];
      exceptionSet.props.membershipExceptions = [...new Set([...current, ...exclusions])].sort();
      patched = true;
    }

    if (!patched) {
      throw new Error(
        `[with-keyboard-target-exclusions] No target uses the synchronized folder "${groupPath}". ` +
          'Is this plugin listed before "@bacons/apple-targets" in app.config.ts plugins?',
      );
    }
    return config;
  });
};

module.exports = withKeyboardTargetExclusions;
