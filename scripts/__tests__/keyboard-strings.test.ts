import {
  androidName,
  androidText,
  buildEntries,
  generateAndroid,
  generateSwift,
  swiftLiteral,
  swiftName,
} from '../lib/keyboard-strings.ts';
import { flatten, LANGUAGES, type Lang, placeholders, pluralParts } from '../lib/locales.ts';

const sample = {
  appName: 'Replywise',
  bar: { lastTrialDay: 'Ends tomorrow: {{price}}/week' },
  counter: { leftToday_one: '{{count}} left today', leftToday_other: '{{count}} left today' },
  tone: { sayNoKindly: 'Say no kindly & don\'t "push"' },
};
const byLang = Object.fromEntries(LANGUAGES.map((l) => [l, flatten(sample)])) as Record<
  Lang,
  ReturnType<typeof flatten>
>;

describe('names', () => {
  it('builds Swift and Android identifiers from key paths', () => {
    expect(swiftName('bar.noFullAccess')).toBe('barNoFullAccess');
    expect(androidName('tone.sayNoKindly')).toBe('kb_tone_say_no_kindly');
    expect(androidName('appName')).toBe('kb_app_name');
  });
});

describe('placeholders and plurals', () => {
  it('lists placeholders in order without duplicates', () => {
    expect(placeholders('{{a}} and {{ b }} then {{a}}')).toEqual(['a', 'b']);
  });

  it('recognises i18next plural keys', () => {
    expect(pluralParts('counter.leftToday_one')).toEqual({
      base: 'counter.leftToday',
      form: 'one',
    });
    expect(pluralParts('bar.offline')).toBeNull();
  });
});

describe('escaping', () => {
  it('escapes Swift string literals', () => {
    expect(swiftLiteral('a "b" \\ c\nd')).toBe('"a \\"b\\" \\\\ c\\nd"');
  });

  it('escapes Android text and maps placeholders to positional arguments', () => {
    expect(androidText("Don't <b> & 50%", [])).toBe("Don\\'t &lt;b&gt; &amp; 50%");
    expect(androidText('{{count}} = 50%', ['count'])).toBe('%1$d = 50%%');
    expect(androidText('@home', [])).toBe('\\@home');
    expect(androidText('{{count}} left, {{price}}', ['count', 'price'])).toBe('%1$d left, %2$s');
    expect(() => androidText('{{nope}}', [])).toThrow('Unknown placeholder');
  });
});

describe('generated files', () => {
  const entries = buildEntries(byLang);

  it('classifies plain, template and plural entries', () => {
    expect(entries.map((e) => [e.kind, e.key])).toEqual([
      ['plain', 'appName'],
      ['template', 'bar.lastTrialDay'],
      ['plural', 'counter.leftToday'],
      ['plain', 'tone.sayNoKindly'],
    ]);
  });

  it('writes a Swift struct with typed functions and one instance per language', () => {
    const swift = generateSwift(entries);
    expect(swift).toContain('public func barLastTrialDay(price: String) -> String');
    expect(swift).toContain('public func counterLeftToday(count: Int) -> String');
    for (const lang of LANGUAGES)
      expect(swift).toContain(`public static let ${lang} = KeyboardStrings(`);
    expect(swift).not.toMatch(/import UIKit/);
  });

  it('writes Android strings and plurals', () => {
    const xml = generateAndroid(entries, 'de');
    expect(xml).toContain('<string name="kb_bar_last_trial_day">Ends tomorrow: %1$s/week</string>');
    expect(xml).toContain('<plurals name="kb_counter_left_today">');
    expect(xml).toContain('<item quantity="one">%1$d left today</item>');
  });

  it('puts count first in plural arguments', () => {
    const withPrice = Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        flatten({ x: { y_one: '{{price}} for {{count}}', y_other: '{{price}} for {{count}}' } }),
      ]),
    ) as typeof byLang;
    const [entry] = buildEntries(withPrice);
    expect(entry).toMatchObject({ kind: 'plural', params: ['count', 'price'] });
    expect(generateAndroid(buildEntries(withPrice), 'en')).toContain('%2$s for %1$d');
  });

  it.each([
    [{ continue: 'x' }, 'reserved Swift name "continue"'],
    [{ bar: { off: 'x' }, barOff: 'y' }, 'both become "barOff"'],
    [{ 'bad-key': 'x' }, 'lowerCamelCase'],
  ])('rejects keys that make invalid or clashing identifiers: %j', (strings, message) => {
    const bad = Object.fromEntries(LANGUAGES.map((l) => [l, flatten(strings)])) as typeof byLang;
    expect(() => buildEntries(bad)).toThrow(message);
  });

  it('fails loudly when a language is missing a key', () => {
    const broken = { ...byLang, it: flatten({ appName: 'Replywise' }) };
    expect(() => buildEntries(broken)).toThrow('keyboard.json (it) is missing "bar.lastTrialDay"');
  });

  it('draft mode falls back to English only when asked, and lists every fallback', () => {
    const broken = { ...byLang, it: flatten({ appName: 'Replywise' }) };
    const missing: string[] = [];
    const entries = buildEntries(broken, { allowMissing: true, missing });
    expect(entries.find((e) => e.key === 'bar.lastTrialDay')).toMatchObject({
      values: { it: 'Ends tomorrow: {{price}}/week' },
    });
    expect(missing).toEqual([
      'it:bar.lastTrialDay',
      'it:counter.leftToday_one',
      'it:counter.leftToday_other',
      'it:tone.sayNoKindly',
    ]);
  });
});
