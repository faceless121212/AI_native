import { resolveLanguage } from '../languages';

describe('resolveLanguage', () => {
  it('maps regional tags to the primary language', () => {
    expect(resolveLanguage(['de-AT'])).toBe('de');
    expect(resolveLanguage(['fr_CA'])).toBe('fr');
    expect(resolveLanguage(['en-US'])).toBe('en');
    expect(resolveLanguage(['ES-mx'])).toBe('es');
  });

  it('takes the first supported tag in preference order', () => {
    expect(resolveLanguage(['pt-BR', 'it-IT', 'de-DE'])).toBe('it');
  });

  it('falls back to English for unsupported or empty input', () => {
    expect(resolveLanguage(['pt-BR', 'ja'])).toBe('en');
    expect(resolveLanguage([])).toBe('en');
    expect(resolveLanguage([null, undefined, ''])).toBe('en');
  });
});
