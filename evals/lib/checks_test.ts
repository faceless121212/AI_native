import { assert, assertEquals, assertFalse } from './assert.ts';
import {
  bannedHits,
  detectLang,
  distinctProblems,
  emojiProblem,
  explicitHits,
  formalityViolations,
  formatProblems,
  frenchSpacingProblem,
  langVerdict,
  lineBreakProblems,
  missingPlaceholders,
  petNameHits,
  phraseHits,
  spanishPunctuationProblem,
  usSpellingHits,
} from './checks.ts';

Deno.test('detectLang: everyday texts in all five languages', () => {
  const cases = [
    ["That's brilliant, well done! What are you most looking forward to?", 'en'],
    ['Oh nein, das klingt nach einer richtig harten Woche. Was war denn los?', 'de'],
    ["Ça arrive à plein de monde, vraiment. Qu'est-ce qui a coincé cette fois ?", 'fr'],
    ['Lo siento muchísimo. ¿Quieres que me pase esta noche con helado?', 'es'],
    ['Mi dispiace tanto. Vuoi sfogarti stasera davanti a una pizza?', 'it'],
    ['Gracias por contar conmigo, pero el sábado no me es posible.', 'es'],
    ['La ringrazio per aver pensato a me, ma giovedì purtroppo non posso.', 'it'],
  ] as const;
  for (const [text, lang] of cases) assertEquals(detectLang(text), lang, text);
});

Deno.test('detectLang: short or ambiguous texts are unknown, not wrong', () => {
  for (const text of ['Ok 👍', 'Haha', 'Pizza?', '😂😂', 'Anna!', '[email]']) {
    assertEquals(detectLang(text), null, text);
    assertEquals(langVerdict(text, 'de'), 'unknown', text);
  }
  assertEquals(langVerdict('Sounds good, see you at the station then!', 'de'), 'wrong');
  assertEquals(langVerdict('Klingt gut, dann sehen wir uns am Bahnhof!', 'de'), 'match');
});

Deno.test('formality: German du vs Sie (sentence-initial "Sie" is not a formal marker)', () => {
  assertEquals(formalityViolations('Danke, dass Sie an mich denken.', 'de', 'formal'), []);
  assertEquals(formalityViolations('Passt dir Donnerstag?', 'de', 'formal'), ['dir']);
  assertEquals(formalityViolations('Kannst du mir Ihre Nummer geben?', 'de', 'casual'), ['Ihre']);
  assertEquals(formalityViolations('Vielen Dank, ich melde mich bei Ihnen.', 'de', 'casual'), [
    'Ihnen',
  ]);
  // "Sie" at the start can be "she": not counted.
  assertEquals(formalityViolations('Sie kommt auch, cool oder?', 'de', 'casual'), []);
  assertEquals(formalityViolations('Klingt gut, bis Donnerstag!', 'de', 'formal'), [], 'neutral');
});

Deno.test("formality: French tu vs vous, including elided t'", () => {
  assertEquals(formalityViolations('Merci, je vous réponds demain.', 'fr', 'formal'), []);
  assert(formalityViolations("Je t'envoie ça demain", 'fr', 'formal').length > 0);
  assertEquals(formalityViolations('Tu me dis si ça va ?', 'fr', 'formal'), ['Tu']);
  assertEquals(formalityViolations('Merci pour votre message !', 'fr', 'casual'), ['votre']);
  assertEquals(formalityViolations('Merci pour ton message !', 'fr', 'casual'), []);
});

Deno.test('formality: plural to a group (casual vous is not formal; singular tu is wrong)', () => {
  // French: casual group plural and formal are the same word.
  assertEquals(
    formalityViolations('Commencez sans moi, je vous rejoins !', 'fr', 'casual', true),
    [],
  );
  assertEquals(formalityViolations('Commence sans moi, je te rejoins !', 'fr', 'casual', true), [
    'te',
  ]);
  // Without plural, casual vous stays a violation.
  assertEquals(formalityViolations('Je vous rejoins !', 'fr', 'casual'), ['vous']);
  // German, Spanish, Italian: the group plural differs from the formal form.
  assertEquals(
    formalityViolations('Fangt ohne mich an, ich komme gleich zu euch.', 'de', 'casual', true),
    [],
  );
  assertEquals(
    formalityViolations('Fangen Sie ohne mich an, ich komme zu Ihnen.', 'de', 'casual', true),
    ['Ihnen', 'Sie'],
  );
  assertEquals(formalityViolations('Empezad sin mí, ahora os veo.', 'es', 'casual', true), []);
  assertEquals(formalityViolations('Empezad sin mí, ¿vale? Te veo ahora.', 'es', 'casual', true), [
    'Te',
  ]);
  assertEquals(
    formalityViolations('Iniziate senza di me, vi raggiungo.', 'it', 'casual', true),
    [],
  );
});

Deno.test('formality: Spanish tú vs usted', () => {
  assertEquals(formalityViolations('¿Le viene bien el jueves?', 'es', 'formal'), []);
  assertEquals(formalityViolations('¿Te viene bien el jueves?', 'es', 'formal'), ['Te']);
  assertEquals(formalityViolations('Como usted prefiera.', 'es', 'casual'), ['usted']);
  assertEquals(formalityViolations('Gracias por tu mensaje', 'es', 'formal'), ['tu']);
});

Deno.test('formality: Italian tu vs Lei', () => {
  assertEquals(formalityViolations('La ringrazio, Le scrivo domani.', 'it', 'formal'), []);
  assertEquals(formalityViolations('Ti mando il file domani', 'it', 'formal'), ['Ti']);
  assert(formalityViolations('La ringrazio per il messaggio', 'it', 'casual').length > 0);
  assertEquals(formalityViolations('Grazie, ti scrivo domani!', 'it', 'casual'), []);
});

Deno.test('formality: English formal means no slang', () => {
  assertEquals(formalityViolations('Thanks for letting me know.', 'en', 'formal'), []);
  assertEquals(formalityViolations('Yeah gonna be late lol', 'en', 'formal'), [
    'Yeah',
    'gonna',
    'lol',
  ]);
  assertEquals(formalityViolations('Yeah gonna be late lol', 'en', 'casual'), []);
});

Deno.test('phrases: banned, explicit, pet names and mustNot (accent- and case-insensitive)', () => {
  assertEquals(bannedHits('Per my last message, it is Friday'), ['per my last message']);
  assertEquals(bannedHits('Wie bereits erwähnt: Freitag'), ['wie bereits erwahnt']);
  assertEquals(explicitHits('Send NUDES'), ['send nudes', 'nudes']);
  assertEquals(explicitHits('Lo scopo è chiaro'), []);
  assertEquals(petNameHits('Thanks babe!', 'en', { relationship: 'match', closeness: 2 }), [
    'babe',
  ]);
  assertEquals(petNameHits('Thanks babe!', 'en', { relationship: 'partner', closeness: 5 }), []);
  assertEquals(petNameHits('Danke, Schatz', 'de', { relationship: 'colleague', closeness: 4 }), [
    'schatz',
  ]);
  assertEquals(phraseHits('Je suis trop contente !', ['content']), [], 'word boundary');
  assertEquals(phraseHits('Je suis trop content !', ['content']), ['content']);
  assertEquals(phraseHits('Estoy CANSADA', ['cansada']), ['cansada']);
  assertEquals(phraseHits('Ich bin fickle', ['fick*']), ['fick*'], 'prefix entries');
});

Deno.test('emoji: none when the message has none, at most one otherwise', () => {
  assertEquals(emojiProblem('Klingt gut!', 'Hey, wie geht es dir?'), null);
  assertEquals(emojiProblem('Klingt gut 😄', 'Hey, wie geht es dir?'), '1 emoji (allowed 0)');
  assertEquals(emojiProblem('Klingt gut 😄', 'Kino? 🎬'), null);
  assertEquals(emojiProblem('😄😄', 'Kino? 🎬'), '2 emoji (allowed 1)');
  assertEquals(
    emojiProblem('Ok ❤️', 'Hi 👋🏽'),
    null,
    'variation selectors and skin tones count once',
  );
});

Deno.test('punctuation: Spanish ¿ ¡ and French spaces', () => {
  assertEquals(spanishPunctuationProblem('¿Quedamos el viernes? ¡Qué bien!'), null);
  assertEquals(spanishPunctuationProblem('Quedamos el viernes?'), 'missing ¿');
  assertEquals(spanishPunctuationProblem('Qué bien!'), 'missing ¡');
  assertEquals(frenchSpacingProblem('Tu viens ? Trop bien !'), null);
  assertEquals(frenchSpacingProblem('Tu viens ?'), null, 'narrow no-break space');
  assertEquals(frenchSpacingProblem('Tu viens?'), 'no space before "?"');
  assertEquals(frenchSpacingProblem('On se voit à 14:30 :)'), null, 'times and emoticons');
});

Deno.test('UK spelling and format problems', () => {
  assertEquals(usSpellingHits('My favorite color'), ['color', 'favorite']);
  assertEquals(usSpellingHits('My favourite colour, say hi to your mum'), []);
  assertEquals(formatProblems('1. Sounds good'), ['numbering or bullet']);
  assertEquals(formatProblems('**Sure!**'), ['markdown']);
  assertEquals(formatProblems('Great day #blessed'), ['hashtag']);
  assertEquals(formatProblems('"Sounds good"'), ['wrapped in quotes']);
  assertEquals(formatProblems('Sure R2|again'), ['format tag inside text']);
  assertEquals(formatProblems("I'm in, see you at 8"), []);
});

Deno.test("line breaks: replies one line; Polish keeps the draft's lines and paragraphs", () => {
  const draft = 'hi sam,\n\nthanks ill be there\nat 8\n\nalex';
  // Reply cards never break; formatProblems no longer flags breaks (Polish may have them).
  assertEquals(lineBreakProblems('reply', 'See you at 8\nAlex', draft), [
    'line break in a reply card',
  ]);
  assertEquals(lineBreakProblems('reply', 'See you at 8', draft), []);
  assertEquals(formatProblems('Hi Sam,\n\nsee you at 8'), []);
  // Light edit: same 4 lines in 3 paragraphs.
  assertEquals(
    lineBreakProblems('light', "Hi Sam,\n\nthanks, I'll be there\nat 8.\n\nAlex", draft),
    [],
  );
  assertEquals(lineBreakProblems('light', "Hi Sam, thanks, I'll be there at 8. Alex", draft), [
    '1 lines, draft has 4',
    '1 paragraphs, draft has 3',
  ]);
  assertEquals(lineBreakProblems('light', "Hi Sam,\nthanks, I'll be there\nat 8.\nAlex", draft), [
    '1 paragraphs, draft has 3',
  ]);
  // Rewrite: may reword, must keep a break.
  assertEquals(lineBreakProblems('rewrite', "Hey Sam!\n\nI'll be there at 8.", draft), []);
  assertEquals(lineBreakProblems('rewrite', "Hey Sam! I'll be there at 8.", draft), [
    'line breaks of the draft lost',
  ]);
  // One-line draft: no breaks added; trailing newline / blank lines in the draft don't count.
  assertEquals(lineBreakProblems('light', 'See you\nat 8', 'see u at 8'), [
    'line break added to a one-line draft',
  ]);
  assertEquals(lineBreakProblems('rewrite', 'See you at 8!', 'see u at 8\n'), []);
});

Deno.test('distinct: near-duplicates and identical openings are flagged', () => {
  assertEquals(
    distinctProblems([
      'Sounds great, see you then!',
      'Sounds great, see you there!',
      'Can I bring anything?',
    ]),
    ['cards 1 and 2 are near-duplicates', 'cards 1 and 2 start the same ("sounds great")'],
  );
  assertEquals(
    distinctProblems(['How was it?', 'I knew you could do it.', 'Drinks on me this weekend?']),
    [],
  );
});

Deno.test('placeholders: polish keeps every placeholder of the draft', () => {
  assertEquals(missingPlaceholders('Send it to [email], thanks', 'Send to [email] pls'), []);
  assertEquals(missingPlaceholders('Send it to me, thanks', 'Send to [email] pls'), ['[email]']);
  assertEquals(missingPlaceholders('[phone] or [phone]', 'call [phone] or [phone]'), []);
  assertFalse(missingPlaceholders('[phone]', 'call [phone] or [phone]').length === 0);
});

Deno.test(
  'checkers agree with the prompt examples: good ones pass, wrong-register bad ones fail',
  async () => {
    const { LANG_RULES } = await import('../../supabase/functions/_shared/prompts/index.ts');
    for (const lang of ['en', 'de', 'fr', 'es', 'it'] as const) {
      for (const group of ['care', 'play', 'clear'] as const) {
        const body = LANG_RULES[lang].examples[group];
        const header = /^Example \(([^)]*)\)/m.exec(body)?.[1] ?? '';
        const formality = /\bformal\b/.test(header) ? 'formal' : 'casual';
        const message = /Message: (.+)$/m.exec(body)?.[1] ?? '';
        for (const m of body.matchAll(/^Good: (.+)$/gm)) {
          const good = m[1]!;
          const where = `${lang} ${group}: ${good}`;
          assertFalse(langVerdict(good, lang) === 'wrong', where);
          assertEquals(formalityViolations(good, lang, formality), [], where);
          assertEquals(emojiProblem(good, message), null, where);
          assertEquals(formatProblems(good), [], where);
          if (lang === 'es') assertEquals(spanishPunctuationProblem(good), null, where);
          if (lang === 'fr') assertEquals(frenchSpacingProblem(good), null, where);
          if (lang === 'en') assertEquals(usSpellingHits(good), [], where);
        }
        for (const m of body.matchAll(/^Bad: (.+) \(([^)]+)\)$/gm)) {
          const [bad, why] = [m[1]!, m[2]!];
          if (/instead of (Sie|vous|usted|Lei)/.test(why)) {
            assert(formalityViolations(bad, lang, 'formal').length > 0, `${lang}: ${bad}`);
          }
        }
      }
    }
  },
);
