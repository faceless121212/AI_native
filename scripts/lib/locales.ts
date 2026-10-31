// Reading and flattening locales/<lang>/<namespace>.json. Plain Node (no Expo imports) so the
// generator and check scripts run with `node scripts/<name>.ts`.
import fs from 'node:fs';
import path from 'node:path';

export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const SOURCE_LANG: Lang = 'en';
export const NAMESPACES = ['common', 'onboarding', 'keyboard', 'paywall', 'notifications'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export type FlatStrings = Map<string, string>;

export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Flattens nested objects to dotted keys. Throws on anything that isn't a string or object. */
export function flatten(value: unknown, prefix = '', out: FlatStrings = new Map()): FlatStrings {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return out;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  throw new Error(`"${prefix}" must be a string or an object, got ${JSON.stringify(value)}`);
}

export function localeFile(root: string, lang: Lang, ns: Namespace): string {
  return path.join(root, 'locales', lang, `${ns}.json`);
}

export function loadNamespace(root: string, lang: Lang, ns: Namespace): FlatStrings {
  return flatten(readJson(localeFile(root, lang, ns)));
}

/** "{{price}} a week" → ["price"], in order of first appearance. */
export function placeholders(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    const name = match[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export const PLURAL_SUFFIXES = ['_one', '_other'] as const;

/** "counter.leftToday_one" → { base: "counter.leftToday", form: "one" }; null if not a plural key. */
export function pluralParts(key: string): { base: string; form: 'one' | 'other' } | null {
  const match = /^(.*)_(one|other)$/.exec(key);
  return match?.[1] && (match[2] === 'one' || match[2] === 'other')
    ? { base: match[1], form: match[2] }
    : null;
}
