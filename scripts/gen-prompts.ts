// supabase/functions/_shared/prompts/**/*.md → a TypeScript string module next to each file
// (reply.v1.md → reply.v1.ts), imported by prompts/index.ts. The .md files stay the source that
// prompt-engineer edits; the generated modules are what Edge Functions bundle (plain TS, no
// text-import or file-read support needed from the Edge Runtime or the deploy bundler).
//   node scripts/gen-prompts.ts           write the modules
//   node scripts/gen-prompts.ts --check   exit 1 if any module is missing, stale or orphaned
import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { repoRoot } from './lib/repo-root.ts';

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

const check = process.argv.includes('--check');
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
  if (problems.length) {
    console.error(
      `Prompt modules out of date:\n  ${problems.join('\n  ')}\nRun: npm run gen:prompts`,
    );
    process.exit(1);
  }
  console.log(`${expected.size} prompt modules up to date.`);
}
