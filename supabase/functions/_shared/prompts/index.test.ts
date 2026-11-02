import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1';
import { Tone } from '../schemas.ts';
import { buildPrompt, PROMPT_VERSION, type PromptInput, randomTag, targetLang } from './index.ts';

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
  assertMatch(p.system, /Write in German/);
  assertMatch(p.system, /Tone: light and funny/);
  assertFalse(p.system.includes('<!--'));
  assertFalse(p.system.includes('{{'));
  assertMatch(p.system, /message-0001/);
  assertEquals([p.kind, p.lang, p.formality, p.maxTokens], ['reply', 'de', 'casual', 600]);
  assertMatch(PROMPT_VERSION, /^[A-Za-z0-9._-]{1,32}$/);
});

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

Deno.test('prompts: polish prompt, every tone has a card, other language → UI language', () => {
  assertMatch(buildPrompt({ ...base, kind: 'polish' }).system, /L\|/);
  for (const tone of Tone.options) buildPrompt({ ...base, tone });
  assertEquals(targetLang('other', 'it'), 'it');
  assertEquals(buildPrompt({ ...base, langHint: 'other', uiLang: 'es' }).lang, 'es');
  assertMatch(randomTag(), /^message-[0-9a-f]{12}$/);
  assertFalse(randomTag() === randomTag());
});
