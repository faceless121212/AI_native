import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkLocales, displayLength, visibleLength } from '../lib/i18n-rules.ts';
import { generateKeyboardStringFiles } from '../lib/keyboard-strings.ts';
import { generateThemeFiles } from '../lib/theme-export.ts';
import { writeFiles } from '../lib/write-files.ts';
import { LANGUAGES, NAMESPACES } from '../lib/locales.ts';

// Builds a throwaway repo with locales/ only; generated-file checks are then reported as stale,
// so tests filter to the rule under test.
function fixture(overrides: Record<string, Record<string, unknown>> = {}, exceptions?: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
  for (const lang of LANGUAGES) {
    for (const ns of NAMESPACES) {
      const base =
        ns === 'keyboard'
          ? { tone: { warm: 'Warm' }, bar: { offline: 'No connection.' } }
          : ns === 'paywall'
            ? { perWeek: '{{price}} a week' }
            : { actions: { continue: 'Continue' } };
      const value = overrides[`${lang}/${ns}`] ?? base;
      fs.mkdirSync(path.join(root, 'locales', lang), { recursive: true });
      fs.writeFileSync(path.join(root, 'locales', lang, `${ns}.json`), JSON.stringify(value));
    }
  }
  if (exceptions) {
    fs.writeFileSync(
      path.join(root, 'locales', 'length-exceptions.json'),
      JSON.stringify(exceptions),
    );
  }
  return root;
}

const localeErrors = (root: string) =>
  checkLocales(root).errors.filter(
    (e) => !e.includes('generated file') && !e.startsWith('Generating'),
  );

describe('checkLocales', () => {
  it('passes a consistent set of locales', () => {
    expect(localeErrors(fixture())).toEqual([]);
  });

  it('reports missing and extra keys', () => {
    const errors = localeErrors(fixture({ 'de/common': { actions: {}, extra: 'x' } }));
    expect(errors).toContain('de/common: missing key "actions.continue"');
    expect(errors).toContain('de/common: extra key "extra" (not in en)');
  });

  it('reports placeholder mismatches', () => {
    const errors = localeErrors(fixture({ 'fr/paywall': { perWeek: '{{prix}} par semaine' } }));
    expect(errors.some((e) => e.startsWith('fr/paywall:perWeek: placeholders [prix]'))).toBe(true);
  });

  it('reports hard-coded prices and banned phrases', () => {
    const errors = localeErrors(
      fixture({ 'es/paywall': { perWeek: '{{price}} a week, solo hoy 4,99 €' } }),
    );
    expect(errors.some((e) => e.includes('hard-coded price'))).toBe(true);
    expect(errors.some((e) => e.includes('banned phrase'))).toBe(true);
  });

  it('enforces length limits unless an exception with a reason allows it', () => {
    const long = { tone: { warm: 'Herzlich und warm' }, bar: { offline: 'No connection.' } };
    expect(localeErrors(fixture({ 'de/keyboard': long }))[0]).toMatch(
      /de\/keyboard:tone\.warm: 17 characters, over the chip limit of 14/,
    );
    const allowed = fixture(
      { 'de/keyboard': long },
      { 'keyboard:tone.warm': { max: 18, reason: 'test' } },
    );
    expect(localeErrors(allowed)).toEqual([]);
  });

  it('rejects exceptions that match nothing or have no reason', () => {
    const errors = localeErrors(
      fixture({}, { 'keyboard:nope': { max: 99, reason: 'x' }, 'keyboard:tone.warm': { max: 20 } }),
    );
    expect(errors).toContain(
      'length-exceptions.json: "keyboard:nope" matches no length-limited key',
    );
    expect(errors).toContain('length-exceptions.json: "keyboard:tone.warm" needs a reason');
  });

  it('reports placeholders the generated Swift would not replace', () => {
    const errors = localeErrors(fixture({ 'it/paywall': { perWeek: '{{ price }} a settimana' } }));
    expect(errors.some((e) => e.includes('must be written exactly as {{name}}'))).toBe(true);
  });

  it('catches prices written with currency words or codes', () => {
    for (const text of [
      '{{price}} statt 4,99 Euro',
      '{{price}}, not EUR 4.99',
      '{{price}} ou 5 euros',
    ]) {
      const errors = localeErrors(fixture({ 'de/paywall': { perWeek: text } }));
      expect(errors.some((e) => e.includes('hard-coded price'))).toBe(true);
    }
  });

  it('length-checks the counter chip with a two-digit count', () => {
    const kb = (counter: string) => ({
      tone: { warm: 'Warm' },
      bar: { offline: 'No connection.' },
      counter: { left_one: counter, left_other: counter },
    });
    const overrides = Object.fromEntries(
      LANGUAGES.map((l) => [`${l}/keyboard`, kb('{{count}} left today')]),
    );
    expect(localeErrors(fixture(overrides))).toEqual([]);
    const long = { ...overrides, 'fr/keyboard': kb('{{count}} restantes aujourd’hui') };
    expect(localeErrors(fixture(long))[0]).toMatch(/fr\/keyboard:counter\.left_one: 24 characters/);
  });

  it('reports generated files that are stale after a locale change', () => {
    const root = fixture();
    writeFiles(root, new Map([...generateKeyboardStringFiles(root), ...generateThemeFiles()]));
    expect(checkLocales(root).errors).toEqual([]);
    fs.writeFileSync(
      path.join(root, 'locales', 'de', 'keyboard.json'),
      JSON.stringify({ tone: { warm: 'Herzlich' }, bar: { offline: 'Keine Verbindung.' } }),
    );
    expect(checkLocales(root).errors).toContain(
      'targets/keyboard/Core/Strings.generated.swift: generated file is stale or missing; run `npm run gen`',
    );
  });

  it('counts user-visible characters, not UTF-16 units', () => {
    expect(displayLength('{{count}} left')).toBe(7);
    expect(visibleLength('↻ More')).toBe(6);
    expect(visibleLength('👍🏽 ok')).toBe(4);
  });
});
