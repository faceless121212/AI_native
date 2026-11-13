// Released prompt versions are frozen (prompt-engineer rule: never edit a released version, copy
// to .v<N+1>.md). supabase/functions/_shared/prompts/released.json records a SHA-256 of every .md
// of a released version; `npm run check:prompts` fails when one changed or disappeared, when a
// new .md appears for a released version, or when PROMPT_VERSION (the one the function sends) is
// not released.
//   node scripts/gen-prompts.ts --release v2   record the hashes of every *.v2.md
//
// What this script cannot see: which files a version actually uses (the PROMPT_SOURCES mapping in
// prompts/index.ts, where a version may reuse an earlier version's file). That is checked by the
// Deno test "released versions use only released files" in prompts/index.test.ts: every text a
// released version sends must hash to a released file of the same or an earlier version. A
// remapping to a different *released* earlier file is not caught; review PROMPT_SOURCES diffs.
import { createHash } from 'node:crypto';

/** version → (path relative to the prompts folder → sha256 hex). */
export type ReleaseManifest = Record<string, Record<string, string>>;

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Prompt sources (relative paths) that belong to a version, e.g. "lang/de.v2.md" for v2. */
export function filesOfVersion(sources: readonly string[], version: string): string[] {
  return sources.filter((f) => f.endsWith(`.${version}.md`)).sort();
}

/**
 * Problems with released files: changed or deleted since release, or a new file added to a
 * released version (`sources`: every prompt .md, relative paths).
 */
export function releaseProblems(
  manifest: ReleaseManifest,
  read: (relative: string) => string | null,
  sources: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const [version, files] of Object.entries(manifest)) {
    for (const [file, hash] of Object.entries(files)) {
      const text = read(file);
      if (text === null) problems.push(`${file} (released ${version}) is missing`);
      else if (sha256(text) !== hash)
        problems.push(`${file} (released ${version}) changed; copy it to the next version instead`);
    }
    for (const file of filesOfVersion(sources, version)) {
      if (!(file in files))
        problems.push(`${file} was added to released ${version}; put it in the next version`);
    }
  }
  return problems;
}

/** A problem when the version the function sends is not released (frozen) yet. */
export function unreleasedVersionProblem(
  manifest: ReleaseManifest,
  promptVersion: string,
): string | null {
  return manifest[promptVersion]
    ? null
    : `PROMPT_VERSION ${promptVersion} is not released; run: node scripts/gen-prompts.ts --release ${promptVersion}`;
}

/** The manifest with `version` recorded from the current files. Throws if it is already released. */
export function recordRelease(
  manifest: ReleaseManifest,
  version: string,
  sources: readonly string[],
  read: (relative: string) => string,
): ReleaseManifest {
  if (manifest[version]) throw new Error(`${version} is already released`);
  const files = filesOfVersion(sources, version);
  if (files.length === 0) throw new Error(`No *.${version}.md prompt files`);
  return {
    ...manifest,
    [version]: Object.fromEntries(files.map((f) => [f, sha256(read(f))])),
  };
}

/** PROMPT_VERSION as written in prompts/index.ts (read as text: the script doesn't import it). */
export function promptVersionIn(indexTs: string): string {
  const m = /export const PROMPT_VERSION(?:: \w+)? = '(v\d+)';/.exec(indexTs);
  if (!m) throw new Error('PROMPT_VERSION not found in prompts/index.ts');
  return m[1]!;
}
