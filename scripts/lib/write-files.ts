import fs from 'node:fs';
import path from 'node:path';

/** Writes generated files and returns the paths whose contents changed. */
export function writeFiles(root: string, files: Map<string, string>): string[] {
  const changed: string[] = [];
  for (const [relative, contents] of files) {
    const target = path.join(root, relative);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === contents) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    changed.push(relative);
  }
  return changed;
}

/** Paths whose file on disk is missing or differs from the generated contents. */
export function staleFiles(root: string, files: Map<string, string>): string[] {
  return [...files].flatMap(([relative, contents]) => {
    const target = path.join(root, relative);
    return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === contents ? [] : [relative];
  });
}
