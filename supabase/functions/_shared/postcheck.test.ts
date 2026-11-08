import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { Lang } from './schemas.ts';
import {
  cardWords,
  cleanCardText,
  confidentlyOtherLanguage,
  dominantLanguage,
  isTopLanguage,
  languageScores,
  postCheckCard,
  repeatsCard,
  sameOpener,
} from './postcheck.ts';

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

Deno.test('postCheckCard honours a larger limit for long Polish rewrites', async () => {
  const { postCheckCard } = await import('./postcheck.ts');
  const { assertEquals } = await import('jsr:@std/assert@1');
  const long = 'This is a fairly long sentence for a polished draft. '.repeat(8).trim();
  assertEquals(postCheckCard(long, null).ok, false);
  assertEquals(postCheckCard(long, null, 600).ok, true);
});

Deno.test('postcheck: Polish newlines are kept and count as one character each', () => {
  const card = 'Hi Sam,\n\nthanks for today.\nSee you soon!';
  assertEquals(cleanCardText(card), card);
  assertEquals(cleanCardText(`  "${card}"\n`), card);
  assertEquals(postCheckCard(card, 'en'), { ok: true, text: card });
  // 299 letters + 1 newline = 300: kept; one more letter: too long.
  const at = 'a'.repeat(150) + '\n' + 'a'.repeat(149);
  assertEquals(postCheckCard(at, 'en'), { ok: true, text: at });
  assertEquals(postCheckCard(at + 'a', 'en'), { ok: false, reason: 'too_long' });
});

Deno.test('postcheck: a banned phrase split over two lines is still caught', () => {
  assertEquals(postCheckCard('Thanks!\nAs an\nAI, I think so', 'en'), {
    ok: false,
    reason: 'banned',
  });
});

Deno.test('postcheck: Spanish card for it, and Italian card for es, are dropped', () => {
  // From the live evals (it-wrong-hint-es, v2 and v3): Spanish cards that passed for "it".
  for (const text of [
    'Me parece genial, tú trae el vino y yo llevo lo demás.',
    'Genial, ahí estaré. Que sea un vino bueno, que hoy me lo merezco.',
    'Perfecto, lo hablamos mañana.',
    '¡Qué bien! Yo llevo el postre.',
    'Vale, y tú qué haces el sábado?',
  ]) {
    assertEquals(confidentlyOtherLanguage(text, 'it'), true, text);
    assertEquals(postCheckCard(text, 'it'), { ok: false, reason: 'wrong_lang' }, text);
    assertEquals(confidentlyOtherLanguage(text, 'es'), false, `${text} (es)`);
  }
  for (const text of [
    'Ci sto! Porto io il dolce, così almeno siamo pari.',
    'Che bello, non vedo l’ora!',
    'Sono stanca, ma il vino lo porto io.',
    'Va bene, è perfetto e ci vediamo dopo.',
  ]) {
    assertEquals(confidentlyOtherLanguage(text, 'es'), true, text);
    assertEquals(confidentlyOtherLanguage(text, 'it'), false, `${text} (it)`);
  }
});

Deno.test('postcheck: short, mixed and neutral es/it cards are kept', () => {
  for (const [text, lang] of [
    ['Perfecto!', 'it'],
    ['Pizza stasera?', 'es'],
    ['Ok, a dopo 👍', 'es'],
    ['Lo so!', 'es'],
    ['Sì, e tu?', 'es'],
    ['Vale!', 'it'],
    ['Ciao Marco, nos vemos el sábado', 'it'],
    ['Perfetto, nos vemos!', 'it'],
    ['Lo so, è vero.', 'es'],
    ['Te lo dico io, ¿vale?', 'it'],
    ['Perfetto, a stasera al solito posto.', 'es'],
    ['Sí, claro.', 'it'],
  ] as const) {
    assertEquals(confidentlyOtherLanguage(text, lang), false, `${text} (${lang})`);
  }
});

Deno.test('postcheck: opener rule (first two normalised words, cards over 2 words)', () => {
  assertEquals(cardWords('Sounds great, see you!'), ['sounds', 'great', 'see', 'you']);
  assertEquals(sameOpener('Sounds great, see you then!', 'Sounds GREAT. Can I bring wine?'), true);
  assertEquals(sameOpener('Ça a l’air génial !', "Ca a l'air top"), true, 'accents, apostrophes');
  assertEquals(sameOpener('How was it?', 'How was the film?'), true);
  assertEquals(sameOpener('How was it?', 'How about Friday?'), false);
  // Two words or fewer in the earlier card: no opener to repeat.
  assertEquals(sameOpener('Sounds great!', 'Sounds great, see you then!'), false);
  assertEquals(sameOpener('Ok', 'Ok'), false);
  assertEquals(sameOpener('😄', 'Ok'), false);
});

Deno.test('postcheck: emoji are stripped first; a card left empty is dropped as empty', () => {
  assertEquals(postCheckCard('Klingt super 😄', 'de', 300, { emoji: 'none' }), {
    ok: true,
    text: 'Klingt super',
    fixed: 'emoji',
  });
  assertEquals(postCheckCard('😂😂', 'en', 300, { emoji: 'none' }), { ok: false, reason: 'empty' });
  assertEquals(postCheckCard('"😂"', 'en', 300, { emoji: 'none' }), { ok: false, reason: 'empty' });
  // Stripped before the quote clean-up and the length check.
  assertEquals(postCheckCard('"Klingt gut!" 😄', 'de', 300, { emoji: 'none' }), {
    ok: true,
    text: 'Klingt gut!',
    fixed: 'emoji',
  });
  assertEquals(postCheckCard('a'.repeat(300) + ' 😄', 'en', 300, { emoji: 'none' }).ok, true);
  assertEquals(postCheckCard('Ja 😄 gerne 🎉', 'de', 300, { emoji: 'one' }), {
    ok: true,
    text: 'Ja 😄 gerne',
    fixed: 'emoji',
  });
  // Unchanged cards carry no `fixed`; default policy changes nothing.
  assertEquals(postCheckCard('Ja 😄', 'de', 300, { emoji: 'one' }), { ok: true, text: 'Ja 😄' });
  assertEquals(postCheckCard('Ja 😄😄', 'de'), { ok: true, text: 'Ja 😄😄' });
  // Polish newlines survive the strip.
  assertEquals(postCheckCard('Hi Sam 👋,\n\nsee you!', 'en', 300, { emoji: 'none' }), {
    ok: true,
    text: 'Hi Sam,\n\nsee you!',
    fixed: 'emoji',
  });
});

Deno.test(
  'postcheck: pipeline repeat rule is looser than the eval (3 words or the same words)',
  () => {
    assertEquals(
      repeatsCard('Sounds great, see you then!', 'Sounds great. Can I bring wine?'),
      null,
    );
    assertEquals(
      sameOpener('Sounds great, see you then!', 'Sounds great. Can I bring wine?'),
      true,
    );
    assertEquals(
      repeatsCard('Sounds great, see you then!', 'Sounds GREAT, SEE what I can do.'),
      'same_opener',
    );
    assertEquals(repeatsCard('Klingt super!', 'klingt super'), 'duplicate', 'short exact repeat');
    assertEquals(repeatsCard('Ok!', 'Ok.'), 'duplicate');
    assertEquals(repeatsCard('Ok!', 'Ok, see you.'), null);
    assertEquals(repeatsCard('Sounds great!', 'Sounds great, see you'), null);
    assertEquals(
      repeatsCard('La ringrazio per il messaggio.', 'La ringrazio per la pazienza, a presto.'),
      'same_opener',
    );
    assertEquals(
      repeatsCard('La ringrazio per il messaggio.', 'La ringrazio, ci vediamo giovedì.'),
      null,
      'live it-pair-formal: two shared words are kept',
    );
  },
);

Deno.test('postcheck: dominant language of the message, null when unsure', () => {
  assertEquals(dominantLanguage('Ci vediamo stasera al solito posto? Porto io il vino.'), 'it');
  assertEquals(dominantLanguage('Hey, wie war dein Wochenende? Ich habe an dich gedacht.'), 'de');
  assertEquals(dominantLanguage('¿Qué tal el fin de semana? Yo estoy muy bien, gracias.'), 'es');
  // Conservative: French stop words in a short Spanish question → unsure (only ever keeps cards).
  assertEquals(dominantLanguage('¿Qué tal te fue el fin de semana?'), null);
  assertEquals(dominantLanguage('Ok 👍'), null);
  assertEquals(dominantLanguage('Pizza?'), null);
});

Deno.test('postcheck: a card in the message language is never wrong_lang', () => {
  const it = 'Che bello! Mi fa piacere che mi scrivi, stavo pensando a te anche io.';
  assertEquals(postCheckCard(it, 'es'), { ok: false, reason: 'wrong_lang' });
  assertEquals(postCheckCard(it, 'es', 300, { messageLang: 'it' }), { ok: true, text: it });
  // Still dropped when it fits neither the expected nor the message language.
  const de = 'Wie war dein Wochenende? Ich habe auch an dich gedacht.';
  assertEquals(postCheckCard(de, 'es', 300, { messageLang: 'it' }), {
    ok: false,
    reason: 'wrong_lang',
  });
  assertEquals(postCheckCard(de, 'it', 300, { messageLang: 'it' }), {
    ok: false,
    reason: 'wrong_lang',
  });
});

Deno.test('postcheck: the message-language exception needs the card to be in that language', () => {
  // Second review: a mixed German/English card for expected fr, message en, is dropped (its best
  // language is de, not the message's en).
  const mixed = 'Hi! Das klingt super, I would love to, wann passt es dir?';
  assertEquals(postCheckCard(mixed, 'fr', 300, { messageLang: 'en' }), {
    ok: false,
    reason: 'wrong_lang',
  });
  // A short Italian card with no dominant language (è is also a French hint) is still kept for
  // an Italian message with a wrong hint: the live it-wrong-hint-es case.
  const it = "Che bello! Com'è andato il tuo fine settimana?";
  assertEquals(dominantLanguage(it), null);
  assertEquals(confidentlyOtherLanguage(it, 'es'), true);
  assertEquals(postCheckCard(it, 'es', 300, { messageLang: 'it' }), { ok: true, text: it });
  // A tie with French still counts as Italian (fr 3, it 3).
  const tie = 'Ahah, sai sempre come farmi ridere. Un caffè questa settimana?';
  assertEquals(isTopLanguage(tie, 'it'), true);
  assertEquals(postCheckCard(tie, 'es', 300, { messageLang: 'it' }), { ok: true, text: tie });
  assertEquals(isTopLanguage(mixed, 'en'), false);
  // Live it-wrong-hint-es (third review): French leads only through è, so HEAD kept it.
  const perche = "Perché no? È un'ottima idea!";
  assertEquals(postCheckCard(perche, 'es', 300, { messageLang: 'it' }), { ok: true, text: perche });
  // Mixing in English is not a third language.
  const sorry = 'Sorry, I was late, the meeting was long: ci vediamo alle 8 invece che alle 7?';
  assertEquals(postCheckCard(sorry, 'es', 300, { messageLang: 'it' }).ok, true);
});

Deno.test(
  'postcheck: the message-language exception keeps every card the d85c2cc rule kept',
  async () => {
    // d85c2cc: kept unless confidently outside both the expected and the message language.
    const { LANG_RULES } = await import('./prompts/index.ts');
    const langs = ['en', 'de', 'fr', 'es', 'it'] as const;
    const head = (t: string, expected: Lang, message: Lang) =>
      !(confidentlyOtherLanguage(t, expected) && confidentlyOtherLanguage(t, message));
    let compared = 0;
    for (const message of langs) {
      const lines = Object.values(LANG_RULES[message].examples)
        .join('\n')
        .split('\n')
        .map((l) => l.replace(/^[-*\d.\s]*/, '').trim())
        .filter((l) => l.length > 8 && postCheckCard(l, message).ok);
      for (const line of lines) {
        for (const expected of langs) {
          if (expected === message) continue;
          compared++;
          if (head(line, expected, message)) {
            assertEquals(
              postCheckCard(line, expected, 300, { messageLang: message }).ok,
              true,
              `${message} example kept by HEAD, expected ${expected}`,
            );
          }
        }
      }
    }
    assert(compared > 400, `compared ${compared}`);
  },
);

Deno.test('postcheck: English has no character hint', () => {
  assertEquals(languageScores('naïve café ü').en, 0);
});
