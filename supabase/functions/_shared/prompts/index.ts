// Prompt assembly (architecture §7 step 7). The texts are the *.v1.md files next to this module,
// owned by prompt-engineer (the current ones are PLACEHOLDERS until Prompt 4). Each .md has a
// generated *.v1.ts string module (scripts/gen-prompts.ts, `npm run gen:prompts`; CI runs
// `npm run check:prompts`), so the Edge Function bundles plain TypeScript and needs no text
// imports or file reads at runtime.
//
// system = safety + reply|polish + lang/<lang> + the tone card from tones.
// user   = user.v1.md: the chip settings, then the (redacted) text wrapped in a tag with a random
//          per-request name, which the system prompt says is data, not instructions.
//
// Never edit a released version: copy to .v2.md, change, bump PROMPT_VERSION, run evals.
import { text as safety } from './safety.v1.ts';
import { text as reply } from './reply.v1.ts';
import { text as polish } from './polish.v1.ts';
import { text as tones } from './tones.v1.ts';
import { text as user } from './user.v1.ts';
import { text as en } from './lang/en.v1.ts';
import { text as de } from './lang/de.v1.ts';
import { text as fr } from './lang/fr.v1.ts';
import { text as es } from './lang/es.v1.ts';
import { text as it } from './lang/it.v1.ts';
import type { LlmPrompt } from '../llm/provider.ts';
import { MAX_OUTPUT_TOKENS } from '../llm/settings.ts';
import type {
  Closeness,
  FlirtLevel,
  Formality,
  Gender,
  Lang,
  LangHint,
  Relationship,
  ReplyKind,
  Tone,
} from '../schemas.ts';

/** Logged with every request (ai_requests.prompt_version). */
export const PROMPT_VERSION = 'v1-placeholder';

function strip(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '').trim();
}

const LANG_RULES: Record<Lang, string> = {
  en: strip(en),
  de: strip(de),
  fr: strip(fr),
  es: strip(es),
  it: strip(it),
};

function toneCards(md: string): Map<string, string> {
  const cards = new Map<string, string>();
  const parts = strip(md).split(/^## +(\S+)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1];
    if (name && body !== undefined) cards.set(name, body.trim());
  }
  return cards;
}

const TONE_CARDS = toneCards(tones);
const SAFETY = strip(safety);
const KIND_PROMPT: Record<ReplyKind, string> = { reply: strip(reply), polish: strip(polish) };
const USER_TEMPLATE = strip(user);

const CLOSENESS_LABEL: Record<number, string> = {
  1: 'just met',
  2: 'getting to know',
  3: 'friendly',
  4: 'close',
  5: 'very close',
};

export interface PromptInput {
  kind: ReplyKind;
  /** Already redacted. */
  text: string;
  langHint: LangHint;
  uiLang: Lang;
  relationship: Relationship;
  closeness: Closeness;
  tone: Tone;
  flirt: FlirtLevel;
  formality: Formality;
  iAm: Gender;
  theyAre: Gender;
}

/** Language the replies should be in: the hinted one, else the keyboard/UI language (spec §3.3). */
export function targetLang(langHint: LangHint, uiLang: Lang): Lang {
  return langHint === 'other' ? uiLang : langHint;
}

export function randomTag(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `message-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function buildPrompt(input: PromptInput, tag: string = randomTag()): LlmPrompt {
  const lang = targetLang(input.langHint, input.uiLang);
  const tone = TONE_CARDS.get(input.tone);
  if (tone === undefined) throw new Error(`No tone card for ${input.tone}`);

  const system = [
    SAFETY,
    KIND_PROMPT[input.kind].replaceAll('{{TAG}}', tag),
    LANG_RULES[lang],
    tone,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  const settings = [
    `kind=${input.kind}`,
    `relationship=${input.relationship}`,
    `closeness=${input.closeness} (${CLOSENESS_LABEL[input.closeness] ?? ''})`,
    `tone=${input.tone}`,
    `flirt=${input.flirt}`,
    `formality=${input.formality}`,
    `i_am=${input.iAm}`,
    `they_are=${input.theyAre}`,
    `language_hint=${input.langHint}`,
    `reply_language=${lang}`,
  ].join('; ');

  // The text can't close the block: the tag is random per request, and any copy of it is removed.
  const text = input.text.replaceAll(tag, '');
  const userTurn = USER_TEMPLATE.replaceAll('{{SETTINGS}}', settings)
    .replaceAll('{{TAG}}', tag)
    // Function replacer: "$&" etc. in user text must not be interpreted. TEXT goes in last.
    .replace('{{TEXT}}', () => text);

  return {
    system,
    user: userTurn,
    maxTokens: MAX_OUTPUT_TOKENS[input.kind],
    kind: input.kind,
    lang,
    formality: input.formality,
  };
}
