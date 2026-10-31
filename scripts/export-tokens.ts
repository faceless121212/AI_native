// src/theme/tokens.ts colours → Swift (iOS keyboard) and Android colour resources (IME).
import { repoRoot } from './lib/repo-root.ts';
import { generateThemeFiles } from './lib/theme-export.ts';
import { writeFiles } from './lib/write-files.ts';

const changed = writeFiles(repoRoot, generateThemeFiles());
console.log(
  changed.length ? `Updated:\n  ${changed.join('\n  ')}` : 'Theme files already up to date.',
);
