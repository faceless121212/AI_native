// Rules behind `npm run i18n:check` (scripts/i18n-check.ts). Fails on UI copy that breaks a rule
// from CLAUDE.md or the i18n-localizer agent: missing or extra keys, placeholder mismatch,
// hard-coded prices, banned pushy or sexual phrases, labels over their length limit, and stale
// generated native files.
import fs from 'node:fs';
import path from 'node:path';

import { generateKeyboardStringFiles } from './keyboard-strings.ts';
import {
  type FlatStrings,
  type Lang,
  LANGUAGES,
  loadNamespace,
  localeFile,
  type Namespace,
  NAMESPACES,
  placeholders,
  readJson,
  SOURCE_LANG,
} from './locales.ts';
import { generateThemeFiles } from './theme-export.ts';
import { staleFiles } from './write-files.ts';

export type LengthRule = {
  name: string;
  max: number;
  applies: (ns: Namespace, key: string) => boolean;
};

export const LENGTH_RULES: LengthRule[] = [
  { name: 'button', max: 24, applies: (_ns, key) => /(^|\.)actions\./.test(key) },
  {
    name: 'chip',
    max: 14,
    applies: (ns, key) =>
      ns === 'keyboard' && /^(relationship|closeness|tone|flirt|formality|chipRows)\./.test(key),
  },
  {
    name: 'keyboard bar message',
    max: 70,
    applies: (ns, key) => ns === 'keyboard' && /^bar\./.test(key),
  },
];

// Prices come from the store via {{price}}; a currency amount in copy is always a bug.
const PRICE = /[€£$]\s?\d|\d\s?[€£$]|\b\d+[.,]\d{2}\s?(?:EUR|GBP|USD)\b/i;

// Pushy, scarcity or sexual framing that CLAUDE.md rule 8 and the store rules forbid.
const BANNED = [
  /\brizz/i,
  /\bhook ?up/i,
  /#1\b/,
  /limited time/i,
  /only today/i,
  /last chance/i,
  /\bhurry\b/i,
  /act now/i,
  /nur heute/i,
  /letzte chance/i,
  /derni[eè]re chance/i,
  /aujourd['’]hui seulement/i,
  /[uú]ltima oportunidad/i,
  /solo hoy/i,
  /ultima occasione/i,
  /solo oggi/i,
];

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const visibleLength = (text: string) => [...segmenter.segment(text)].length;

type Exceptions = Record<string, { max: number; reason: string }>;

export function checkLocales(root: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const exceptionsFile = path.join(root, 'locales', 'length-exceptions.json');
  const exceptions = (fs.existsSync(exceptionsFile) ? readJson(exceptionsFile) : {}) as Exceptions;
  const usedExceptions = new Set<string>();

  for (const ns of NAMESPACES) {
    const loaded = new Map<Lang, FlatStrings>();
    for (const lang of LANGUAGES) {
      const file = localeFile(root, lang, ns);
      if (!fs.existsSync(file)) {
        errors.push(`${path.relative(root, file)}: file missing`);
        continue;
      }
      try {
        loaded.set(lang, loadNamespace(root, lang, ns));
      } catch (error) {
        errors.push(`${path.relative(root, file)}: ${(error as Error).message}`);
      }
    }
    const source = loaded.get(SOURCE_LANG);
    if (!source) continue;

    for (const [lang, strings] of loaded) {
      for (const key of source.keys()) {
        if (!strings.has(key)) errors.push(`${lang}/${ns}: missing key "${key}"`);
      }
      for (const key of strings.keys()) {
        if (!source.has(key))
          errors.push(`${lang}/${ns}: extra key "${key}" (not in ${SOURCE_LANG})`);
      }

      for (const [key, value] of strings) {
        const id = `${lang}/${ns}:${key}`;
        if (value.trim() === '') errors.push(`${id}: empty string`);

        const sourceValue = source.get(key);
        if (sourceValue !== undefined) {
          const expected = placeholders(sourceValue).sort().join(', ');
          const actual = placeholders(value).sort().join(', ');
          if (expected !== actual)
            errors.push(`${id}: placeholders [${actual}] differ from ${SOURCE_LANG} [${expected}]`);
        }

        if (PRICE.test(value)) errors.push(`${id}: hard-coded price "${value}"; use {{price}}`);
        for (const pattern of BANNED) {
          if (pattern.test(value)) errors.push(`${id}: banned phrase ${pattern} in "${value}"`);
        }

        const rule = LENGTH_RULES.find((r) => r.applies(ns, key));
        if (rule) {
          const exceptionKey = `${ns}:${key}`;
          const exception = exceptions[exceptionKey];
          const max = exception?.max ?? rule.max;
          if (exception) usedExceptions.add(exceptionKey);
          const length = visibleLength(value);
          if (length > max) {
            errors.push(
              `${id}: ${length} characters, over the ${rule.name} limit of ${max}${exception ? ' (length-exceptions.json)' : ''}: "${value}"`,
            );
          }
        }
      }
    }
  }

  for (const key of Object.keys(exceptions)) {
    if (!usedExceptions.has(key))
      errors.push(`length-exceptions.json: "${key}" matches no length-limited key`);
    else if (!exceptions[key]?.reason?.trim())
      errors.push(`length-exceptions.json: "${key}" needs a reason`);
  }

  try {
    const generated = new Map([...generateKeyboardStringFiles(root), ...generateThemeFiles()]);
    for (const file of staleFiles(root, generated)) {
      errors.push(`${file}: generated file is stale or missing; run \`npm run gen\``);
    }
  } catch (error) {
    errors.push(`Generating native files failed: ${(error as Error).message}`);
  }

  return { errors, warnings };
}
