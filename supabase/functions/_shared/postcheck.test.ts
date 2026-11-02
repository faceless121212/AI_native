import { assertEquals } from 'jsr:@std/assert@1';
import { cleanCardText, confidentlyOtherLanguage, postCheckCard } from './postcheck.ts';

Deno.test('postcheck: length ≤ 300 code points (emoji count as one)', () => {
  assertEquals(postCheckCard('😊'.repeat(300), 'en').ok, true);
  assertEquals(postCheckCard('a'.repeat(301), 'en'), { ok: false, reason: 'too_long' });
  assertEquals(postCheckCard('   ', 'en'), { ok: false, reason: 'empty' });
});

Deno.test('postcheck: explicit terms and banned phrases, case- and accent-insensitive', () => {
  assertEquals(postCheckCard('Send NUDES please', 'en'), { ok: false, reason: 'explicit' });
  assertEquals(postCheckCard('Schick mir Nacktbilder', 'de'), { ok: false, reason: 'explicit' });
  assertEquals(postCheckCard('As an AI, I think so', 'en'), { ok: false, reason: 'banned' });
  assertEquals(postCheckCard("En tant qu'IA je dirais oui", 'fr'), { ok: false, reason: 'banned' });
  assertEquals(postCheckCard('Snudes are a typo', 'en').ok, true, 'word boundary');
});

Deno.test('postcheck: language heuristic drops only confident mismatches', () => {
  assertEquals(postCheckCard('Wie war dein Wochenende? Ich habe auch an dich gedacht.', 'en'), {
    ok: false,
    reason: 'wrong_lang',
  });
  assertEquals(
    postCheckCard('Wie war dein Wochenende? Ich habe auch an dich gedacht.', 'de').ok,
    true,
  );
  for (const [text, lang] of [
    ['Ok 👍', 'de'],
    ['Haha', 'fr'],
    ['Anna!', 'it'],
    ['Pizza?', 'es'],
    ['[email] ok', 'de'],
  ] as const) {
    assertEquals(confidentlyOtherLanguage(text, lang), false, text);
  }
  assertEquals(confidentlyOtherLanguage('¿Qué tal te fue el fin de semana?', 'it'), true);
  assertEquals(confidentlyOtherLanguage("Ça a l'air génial ! Et toi, ton week-end ?", 'en'), true);
});

Deno.test('postcheck: one pair of wrapping quotes is stripped', () => {
  assertEquals(cleanCardText('"Klingt gut!"'), 'Klingt gut!');
  assertEquals(cleanCardText('« Merci ! »'), 'Merci !');
  assertEquals(cleanCardText('"Yes" she said "no"'), '"Yes" she said "no"');
});
