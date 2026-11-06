// locales/<lang>/keyboard.json → Swift (iOS keyboard) and Android string resources (IME).
// `--allow-missing`: draft mode for new keys that exist only in English so far (see BuildOptions).
import { generateKeyboardStringFiles } from './lib/keyboard-strings.ts';
import { repoRoot } from './lib/repo-root.ts';
import { writeFiles } from './lib/write-files.ts';

const allowMissing = process.argv.includes('--allow-missing');
const missing: string[] = [];
const changed = writeFiles(
  repoRoot,
  generateKeyboardStringFiles(repoRoot, { allowMissing, missing }),
);
console.log(
  changed.length ? `Updated:\n  ${changed.join('\n  ')}` : 'Keyboard strings already up to date.',
);
if (missing.length) {
  console.warn(
    `DRAFT: ${missing.length} translations missing, English used instead (npm run i18n:check fails until they are added):\n  ${missing.join('\n  ')}`,
  );
}
