// supabase/functions/_shared/prompts/**/*.md → a TypeScript string module next to each file
// (reply.v1.md → reply.v1.ts), imported by prompts/index.ts. The .md files stay the source that
// prompt-engineer edits; the generated modules are what Edge Functions bundle (plain TS, no
// text-import or file-read support needed from the Edge Runtime or the deploy bundler).
// Every version (*.v1.md, *.v2.md, …) is generated, so older versions stay buildable for evals.
//   node scripts/gen-prompts.ts                write the modules
//   node scripts/gen-prompts.ts --check        exit 1 if any module is missing, stale or orphaned,
//                                              a released version's .md changed or was added,
//                                              or PROMPT_VERSION is not released (released.json)
//   node scripts/gen-prompts.ts --release v2   freeze v2: record its .md hashes in released.json
import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { repoRoot } from './lib/repo-root.ts';
import {
  promptVersionIn,
  recordRelease,
  releaseProblems,
  type ReleaseManifest,
  unreleasedVersionProblem,
} from './lib/prompt-release.ts';

const DIR = 'supabase/functions/_shared/prompts';
const MARKER = '// Generated from';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const root = path.join(repoRoot, DIR);
const files = walk(root);
const sources = files.filter((f) => f.endsWith('.md')).sort();
const expected = new Map<string, string>();

for (const md of sources) {
  const target = md.replace(/\.md$/, '.ts');
  const rel = path.relative(repoRoot, md);
  const text = fs.readFileSync(md, 'utf8');
  const code = [
    `${MARKER} ${rel} by scripts/gen-prompts.ts.`,
    '// Do not edit: change the .md and run `npm run gen:prompts`.',
    `export const text: string = ${JSON.stringify(text)};`,
    '',
  ].join('\n');
  const options = (await prettier.resolveConfig(target)) ?? {};
  expected.set(target, await prettier.format(code, { ...options, parser: 'typescript' }));
}

// Generated modules whose .md is gone.
const orphans = files.filter(
  (f) => f.endsWith('.ts') && !expected.has(f) && fs.readFileSync(f, 'utf8').startsWith(MARKER),
);

// Released versions are frozen.
const manifestPath = path.join(root, 'released.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReleaseManifest;
const relSources = sources.map((f) => path.relative(root, f).split(path.sep).join('/'));
const readPrompt = (rel: string): string | null => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
};
const releaseIndex = process.argv.indexOf('--release');
if (releaseIndex >= 0) {
  const version = process.argv[releaseIndex + 1];
  if (!version || !/^v\d+$/.test(version)) {
    console.error('Usage: node scripts/gen-prompts.ts --release v<N>');
    process.exit(2);
  }
  const next = recordRelease(manifest, version, relSources, (rel) => readPrompt(rel) ?? '');
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(next[version]!).length} released files of ${version}.`);
  process.exit(0);
}

const check = process.argv.includes('--check');
const freezeProblems: string[] = releaseProblems(manifest, readPrompt, relSources);
if (!check && freezeProblems.length) {
  console.error(`Released prompt files changed:\n  ${freezeProblems.join('\n  ')}`);
  process.exit(1);
}
if (check) {
  const unreleased = unreleasedVersionProblem(
    manifest,
    promptVersionIn(fs.readFileSync(path.join(root, 'index.ts'), 'utf8')),
  );
  if (unreleased) freezeProblems.push(unreleased);
}
const problems: string[] = [];
for (const [target, contents] of expected) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === contents) continue;
  if (check)
    problems.push(
      `${path.relative(repoRoot, target)} is ${current === null ? 'missing' : 'stale'}`,
    );
  else {
    fs.writeFileSync(target, contents);
    console.log(`Updated ${path.relative(repoRoot, target)}`);
  }
}
for (const orphan of orphans) {
  if (check) problems.push(`${path.relative(repoRoot, orphan)} has no .md source`);
  else {
    fs.unlinkSync(orphan);
    console.log(`Removed ${path.relative(repoRoot, orphan)}`);
  }
}

if (check) {
  if (freezeProblems.length)
    console.error(
      `Released prompt versions (released.json):\n  ${freezeProblems.join('\n  ')}\nNever edit a released version: copy it to the next version.`,
    );
  if (problems.length)
    console.error(
      `Prompt modules out of date:\n  ${problems.join('\n  ')}\nRun: npm run gen:prompts`,
    );
  if (freezeProblems.length || problems.length) process.exit(1);
  console.log(`${expected.size} prompt modules up to date; released versions unchanged.`);
}
