import { NAMESPACES as SCRIPT_NAMESPACES } from '../../../../scripts/lib/locales.ts';
import { i18n } from '../index';
import { NAMESPACES } from '../resources';

describe('plurals', () => {
  const left = (lng: string, count: number) => i18n.t('keyboard:counter.leftToday', { lng, count });

  it('uses "one" for 1 and "other" otherwise in en, de, es, it', () => {
    expect(left('en', 1)).toBe('1 left today');
    expect(left('en', 3)).toBe('3 left today');
    expect(left('es', 1)).toBe('Queda 1');
    expect(left('es', 0)).toBe('Quedan 0');
    expect(left('it', 2)).toBe('Ancora 2');
  });

  it('treats 0 as singular in French', () => {
    expect(left('fr', 0)).toBe('0 restante');
    expect(left('fr', 1)).toBe('1 restante');
    expect(left('fr', 2)).toBe('2 restantes');
  });

  it('fills placeholders', () => {
    expect(i18n.t('keyboard:bar.lastTrialDay', { lng: 'de', price: '29,99 €' })).toContain(
      '29,99 €/Jahr',
    );
  });
});

it('the app and the scripts agree on the namespaces', () => {
  expect([...NAMESPACES]).toEqual([...SCRIPT_NAMESPACES]);
});
