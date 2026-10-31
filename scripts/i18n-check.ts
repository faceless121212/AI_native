// npm run i18n:check — see scripts/lib/i18n-rules.ts for what it checks.
import { checkLocales } from './lib/i18n-rules.ts';
import { LANGUAGES, NAMESPACES } from './lib/locales.ts';
import { repoRoot } from './lib/repo-root.ts';

const { errors, warnings } = checkLocales(repoRoot);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  console.error(`i18n:check failed with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ✕ ${e}`);
  process.exit(1);
}
console.log(
  `i18n:check passed: ${LANGUAGES.length} languages × ${NAMESPACES.length} namespaces, generated files up to date.`,
);
