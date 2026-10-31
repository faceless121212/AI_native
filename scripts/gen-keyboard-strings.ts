// locales/<lang>/keyboard.json → Swift (iOS keyboard) and Android string resources (IME).
import { generateKeyboardStringFiles } from './lib/keyboard-strings.ts';
import { repoRoot } from './lib/repo-root.ts';
import { writeFiles } from './lib/write-files.ts';

const changed = writeFiles(repoRoot, generateKeyboardStringFiles(repoRoot));
console.log(
  changed.length ? `Updated:\n  ${changed.join('\n  ')}` : 'Keyboard strings already up to date.',
);
