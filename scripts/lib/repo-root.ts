import path from 'node:path';

// Only CLI entry points import this: Jest (CommonJS) can't parse import.meta.
export const repoRoot = path.resolve(import.meta.dirname, '..', '..');
