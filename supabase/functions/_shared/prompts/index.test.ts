import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1';
import { LANGS, Tone } from '../schemas.ts';
import { postCheckCard } from '../postcheck.ts';
import { looksLikeCrisis } from '../crisis.ts';
import { BANNED_PHRASES, EXPLICIT_TERMS, PET_NAMES } from './blocklist.v1.ts';
import {
  buildPrompt,
  LANG_RULES,
  PROMPT_VERSION,
  type PromptInput,
  randomTag,
  sections,
  targetLang,
  TONE_GROUP,
} from './index.ts';
import { text as tonesMd } from './tones.v1.ts';

const base: PromptInput = {
  kind: 'reply',
  text: 'Hast du Lust auf Kino? $& $1 {{TEXT}}',
  langHint: 'de',
  uiLang: 'en',
  relationship: 'match',
  closeness: 2,
  tone: 'funny',
  flirt: 'light',
  formality: 'casual',
  iAm: 'woman',
  theyAre: 'man',
};

Deno.test('prompts: system = safety + kind + language + tone card; no editor comments', () => {
  const p = buildPrompt(base, 'message-0001');
  assertMatch(p.system, /^Safety rules/);
  assertMatch(p.system, /R1\|/);
  assertMatch(p.system, /Language: German/);
  assertMatch(p.system, /Examples \(tone group play\)/);
  assertMatch(p.system, /Tone: funny/);
  assertFalse(p.system.includes('<!--'));
  assertFalse(p.system.includes('{{'));
  assertFalse(p.system.includes('PLACEHOLDER'));
  assertMatch(p.system, /message-0001/);
  assertEquals([p.kind, p.lang, p.formality, p.maxTokens], ['reply', 'de', 'casual', 600]);
  assertEquals(PROMPT_VERSION, 'v1');
});

Deno.test('prompts: only the example group of the selected tone is sent', () => {
  const play = buildPrompt(base, 'message-0001').system;
  assert(play.includes(LANG_RULES.de.examples.play));
  assertFalse(play.includes(LANG_RULES.de.examples.care));
  assertFalse(play.includes(LANG_RULES.de.examples.clear));
  const clear = buildPrompt({ ...base, tone: 'professional' }, 'message-0001').system;
  assert(clear.includes(LANG_RULES.de.examples.clear));
  assertFalse(clear.includes(LANG_RULES.de.examples.play));
  // Only one language file goes in.
  assertFalse(play.includes(LANG_RULES.fr.rules));
});

Deno.test(
  'prompts: output contract puts META first (crisis and language arrive before cards)',
  () => {
    for (const kind of ['reply', 'polish'] as const) {
      const system = buildPrompt({ ...base, kind }, 'message-0001').system;
      const meta = system.indexOf('\nMETA|{');
      const firstCard = system.indexOf(kind === 'reply' ? '\nR1|' : '\nL|');
      assert(meta > 0 && firstCard > meta, kind);
      assertMatch(system, /"crisis":false,"refused":false\}/);
    }
  },
);

Deno.test(
  'prompts: user text goes last, verbatim, inside the tag ($ patterns not interpreted)',
  () => {
    const p = buildPrompt(base, 'message-0001');
    assertMatch(
      p.user,
      /^Settings: kind=reply; relationship=match; closeness=2 \(getting to know\); tone=funny; flirt=light;/,
    );
    assert(
      p.user.endsWith('<message-0001>\nHast du Lust auf Kino? $& $1 {{TEXT}}\n</message-0001>'),
    );
  },
);

Deno.test('prompts: settings carry the address form per language and the emoji rule', () => {
  const cases = [
    ['de', 'casual', 'address=du'],
    ['de', 'formal', 'address=Sie'],
    ['fr', 'formal', 'address=vous'],
    ['es', 'casual', 'address=tú'],
    ['es', 'formal', 'address=usted'],
    ['it', 'formal', 'address=Lei'],
    ['en', 'formal', 'address=formal (polite, plain)'],
  ] as const;
  for (const [lang, formality, expected] of cases) {
    const p = buildPrompt({ ...base, langHint: lang, formality }, 'message-0001');
    assert(p.user.includes(`; ${expected};`), `${lang} ${formality}`);
  }
  assert(buildPrompt(base, 'message-0001').user.includes('emoji=none'));
  assert(
    buildPrompt({ ...base, text: 'Kino? 🎬' }, 'message-0001').user.includes(
      'emoji=at most one per reply',
    ),
  );
});

Deno.test('prompts: polish prompt, every tone has a card, other language → UI language', () => {
  assertMatch(buildPrompt({ ...base, kind: 'polish' }).system, /L\|/);
  for (const tone of Tone.options) buildPrompt({ ...base, tone });
  assertEquals(targetLang('other', 'it'), 'it');
  assertEquals(buildPrompt({ ...base, langHint: 'other', uiLang: 'es' }).lang, 'es');
  assertMatch(randomTag(), /^message-[0-9a-f]{12}$/);
  assertFalse(randomTag() === randomTag());
});

Deno.test('prompts: 8 tone cards, each with what to do and what to avoid', () => {
  const cards = sections(tonesMd);
  assertEquals([...cards.keys()].sort(), [...Tone.options].sort());
  for (const [tone, body] of cards) {
    assertMatch(body, /^Tone: /, tone);
    assertMatch(body, /\nAvoid: /, tone);
  }
  assertEquals(Object.keys(TONE_GROUP).sort(), [...Tone.options].sort());
});

/** Good/Bad lines of an example group, with the formality from its "Example (…)" header. */
function examples(body: string) {
  const header = /^Example \(([^)]*)\)/m.exec(body)?.[1] ?? '';
  const formality = header.includes('formal') && !header.includes('casual') ? 'formal' : 'casual';
  const good = [...body.matchAll(/^Good: (.+)$/gm)].map((m) => m[1]!);
  const bad = [...body.matchAll(/^Bad: (.+)$/gm)].map((m) => m[1]!);
  return { formality, good, bad };
}

Deno.test('prompts: each language file has 3 good and 3 bad examples per tone group', () => {
  for (const lang of LANGS) {
    for (const group of ['care', 'play', 'clear'] as const) {
      const ex = examples(LANG_RULES[lang].examples[group]);
      assertEquals([ex.good.length, ex.bad.length], [3, 3], `${lang} ${group}`);
      for (const bad of ex.bad) assertMatch(bad, /\([^)]+\)$/, `${lang} ${group}: reason`);
    }
    assertMatch(LANG_RULES[lang].banned, /pet names/i, lang);
  }
});

Deno.test('prompts: good examples survive the post-check (no blocklist false positives)', () => {
  for (const lang of LANGS) {
    for (const group of ['care', 'play', 'clear'] as const) {
      for (const good of examples(LANG_RULES[lang].examples[group]).good) {
        assertEquals(postCheckCard(good, lang), { ok: true, text: good }, `${lang}: ${good}`);
        assertFalse(looksLikeCrisis(good), `${lang}: ${good}`);
      }
    }
  }
});

Deno.test('blocklist: entries are lowercase, unique and not blank', () => {
  const all = [...EXPLICIT_TERMS, ...BANNED_PHRASES, ...Object.values(PET_NAMES).flat()];
  for (const entry of all) {
    assertEquals(entry, entry.toLowerCase(), entry);
    assert(entry.trim().length > 1, entry);
  }
  assertEquals(new Set(EXPLICIT_TERMS).size, EXPLICIT_TERMS.length);
  assertEquals(new Set(BANNED_PHRASES).size, BANNED_PHRASES.length);
});

Deno.test(
  'blocklist: catches clichés, greasy lines and explicit terms in all five languages',
  () => {
    const dropped: Array<[string, 'explicit' | 'banned']> = [
      ['Did it hurt when you fell from heaven?', 'banned'],
      ['Per my last message, Friday.', 'banned'],
      ['Hat es wehgetan, als du vom Himmel gefallen bist?', 'banned'],
      ['Wie bereits erwähnt, Freitag.', 'banned'],
      ["T'es tombée du ciel ?", 'banned'],
      ["Comme je te l'ai déjà dit, non.", 'banned'],
      ['¿Te dolió cuando caíste del cielo?', 'banned'],
      ['Como ya te dije, no.', 'banned'],
      ['Come ti ho già detto, no.', 'banned'],
      ['Sono un’IA, non posso', 'banned'],
      ['Wanna sext later?', 'explicit'],
      ['Schick mir ein Nacktfoto', 'explicit'],
      ['On peut coucher avec toi ce soir', 'explicit'],
      ['Quiero follarte', 'explicit'],
      ['Stasera fare sesso?', 'explicit'],
    ];
    for (const [text, reason] of dropped) {
      assertEquals(postCheckCard(text, null), { ok: false, reason }, text);
    }
    // Everyday words that share letters with list entries stay.
    for (const text of [
      'The weather is fickle today',
      'Das Geld ist nicht vom Himmel gefallen',
      'La pluie tombe du ciel depuis ce matin',
      'Tengo un folleto del concierto',
      'Lo scopo della riunione è chiaro',
      'Ciao bella, come stai?',
      'Hola guapa, ¿qué tal?',
      'Wie schon gesagt, ich freue mich!',
    ]) {
      assertEquals(postCheckCard(text, null).ok, true, text);
    }
  },
);
