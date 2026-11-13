// Prompt assembly (architecture §7 step 7). The texts are the *.v<N>.md files next to this module,
// owned by prompt-engineer. Each .md has a generated *.v<N>.ts string module
// (scripts/gen-prompts.ts, `npm run gen:prompts`; CI runs `npm run check:prompts`, which also
// fails when a released version's .md changed, see released.json), so the Edge Function bundles
// plain TypeScript and needs no text imports or file reads at runtime.
//
// system = safety + reply|polish + lang/<lang> (rules, the example group of the selected tone
//          and relationship, banned phrases) + the tone card from tones. Only one language file and one example
//          group go in, to keep the system prompt short (first-token latency).
// user   = user.v1.md: the chip settings, then the (redacted) text wrapped in a tag with a random
//          per-request name, which the system prompt says is data, not instructions.
//
// Versions: PROMPT_SOURCES lists the files of every version (a version may reuse an unchanged
// file of an earlier one); PROMPT_VERSION is the one the function sends. Older versions stay
// buildable for eval comparisons (scripts/run-evals.ts --version).
// Never edit a released version: copy to .v<N+1>.md, change, add it here, bump PROMPT_VERSION,
// run evals.
import { text as safetyV1 } from './safety.v1.ts';
import { text as replyV1 } from './reply.v1.ts';
import { text as polishV1 } from './polish.v1.ts';
import { text as tonesV1 } from './tones.v1.ts';
import { text as userV1 } from './user.v1.ts';
import { text as enV1 } from './lang/en.v1.ts';
import { text as deV1 } from './lang/de.v1.ts';
import { text as frV1 } from './lang/fr.v1.ts';
import { text as esV1 } from './lang/es.v1.ts';
import { text as itV1 } from './lang/it.v1.ts';
import { text as safetyV2 } from './safety.v2.ts';
import { text as replyV2 } from './reply.v2.ts';
import { text as polishV2 } from './polish.v2.ts';
import { text as enV2 } from './lang/en.v2.ts';
import { text as deV2 } from './lang/de.v2.ts';
import { text as frV2 } from './lang/fr.v2.ts';
import { text as esV2 } from './lang/es.v2.ts';
import { text as itV2 } from './lang/it.v2.ts';
import { text as safetyV3 } from './safety.v3.ts';
import { text as replyV3 } from './reply.v3.ts';
import { text as polishV3 } from './polish.v3.ts';
import { text as enV3 } from './lang/en.v3.ts';
import { text as deV3 } from './lang/de.v3.ts';
import { text as frV3 } from './lang/fr.v3.ts';
import { text as esV3 } from './lang/es.v3.ts';
import { text as itV3 } from './lang/it.v3.ts';
import { text as replyV4 } from './reply.v4.ts';
import { text as polishV4 } from './polish.v4.ts';
import { text as enV4 } from './lang/en.v4.ts';
import { text as deV4 } from './lang/de.v4.ts';
import { text as frV4 } from './lang/fr.v4.ts';
import { text as esV4 } from './lang/es.v4.ts';
import { text as itV4 } from './lang/it.v4.ts';
import { emojiAllowed } from '../emoji.ts';
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

interface PromptSources {
  safety: string;
  reply: string;
  polish: string;
  tones: string;
  user: string;
  lang: Readonly<Record<Lang, string>>;
}

/** Source files per version. v2–v4 reuse v1's tone cards and user turn; v4 reuses v3's safety rules. */
export const PROMPT_SOURCES = {
  v1: {
    safety: safetyV1,
    reply: replyV1,
    polish: polishV1,
    tones: tonesV1,
    user: userV1,
    lang: { en: enV1, de: deV1, fr: frV1, es: esV1, it: itV1 },
  },
  v2: {
    safety: safetyV2,
    reply: replyV2,
    polish: polishV2,
    tones: tonesV1,
    user: userV1,
    lang: { en: enV2, de: deV2, fr: frV2, es: esV2, it: itV2 },
  },
  v3: {
    safety: safetyV3,
    reply: replyV3,
    polish: polishV3,
    tones: tonesV1,
    user: userV1,
    lang: { en: enV3, de: deV3, fr: frV3, es: esV3, it: itV3 },
  },
  v4: {
    safety: safetyV3,
    reply: replyV4,
    polish: polishV4,
    tones: tonesV1,
    user: userV1,
    lang: { en: enV4, de: deV4, fr: frV4, es: esV4, it: itV4 },
  },
} as const satisfies Record<string, PromptSources>;

export type PromptVersion = keyof typeof PROMPT_SOURCES;
export const PROMPT_VERSIONS = Object.keys(PROMPT_SOURCES) as PromptVersion[];

/** Sent by the function and logged with every request (ai_requests.prompt_version). */
export const PROMPT_VERSION: PromptVersion = 'v4';

export function isPromptVersion(value: string): value is PromptVersion {
  return Object.hasOwn(PROMPT_SOURCES, value);
}

function strip(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** Example groups in the language files; each tone uses one (spec §11: review per tone group). */
export type ToneGroup = 'care' | 'play' | 'flirt' | 'clear';
export const TONE_GROUPS: readonly ToneGroup[] = ['care', 'play', 'flirt', 'clear'];
export const TONE_GROUP: Readonly<Record<Tone, ToneGroup>> = {
  warm: 'care',
  calm: 'care',
  apologise: 'care',
  funny: 'play',
  flirty: 'flirt',
  confident: 'play',
  sayNoKindly: 'clear',
  professional: 'clear',
};

/**
 * The example group sent with a request. Flirt examples (a match exchange) only go to Flirty
 * with a match or partner; everyone else gets the neutral groups, so flirting can't bleed into
 * replies to friends, family or colleagues.
 */
export function exampleGroup(tone: Tone, relationship: Relationship): ToneGroup {
  const group = TONE_GROUP[tone];
  if (group === 'flirt' && relationship !== 'match' && relationship !== 'partner') return 'play';
  return group;
}

/** "## name" sections of a markdown file (editor comments removed). */
export function sections(md: string): Map<string, string> {
  const result = new Map<string, string>();
  const parts = strip(md).split(/^## +(.+?)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1];
    if (name && body !== undefined) result.set(name.trim(), body.trim());
  }
  return result;
}

export interface LangRules {
  rules: string;
  examples: Record<ToneGroup, string>;
  banned: string;
}

function langRules(version: PromptVersion, lang: Lang, md: string): LangRules {
  const s = sections(md);
  const get = (name: string): string => {
    const body = s.get(name);
    if (!body) throw new Error(`lang/${lang} (${version}): missing section "## ${name}"`);
    return body;
  };
  return {
    rules: get('rules'),
    examples: {
      care: get('examples care'),
      play: get('examples play'),
      flirt: get('examples flirt'),
      clear: get('examples clear'),
    },
    banned: get('banned'),
  };
}

/** What casual / formal mean in each language (spec §3.2). */
const ADDRESS: Readonly<Record<Lang, Record<Formality, string>>> = {
  en: { casual: 'casual', formal: 'formal (polite, plain)' },
  de: { casual: 'du', formal: 'Sie' },
  fr: { casual: 'tu', formal: 'vous' },
  es: { casual: 'tú', formal: 'usted' },
  it: { casual: 'tu', formal: 'Lei' },
};

function safetyRules(version: PromptVersion, md: string): Record<ReplyKind, string> {
  const s = sections(md);
  if (s.size === 0) return { reply: strip(md), polish: strip(md) };
  const get = (name: string): string => {
    const body = s.get(name);
    if (!body) throw new Error(`safety (${version}): missing section "## ${name}"`);
    return body;
  };
  return { reply: `${get('all')}\n${get('reply')}`, polish: `${get('all')}\n${get('polish')}` };
}

/** One version, parsed once at load (a missing section fails at import, in tests and in CI). */
export interface PromptSet {
  /** Safety rules per kind (v1: one text for both; v2+: "## all" + "## reply" | "## polish"). */
  safety: Readonly<Record<ReplyKind, string>>;
  kind: Readonly<Record<ReplyKind, string>>;
  user: string;
  toneCards: ReadonlyMap<string, string>;
  langRules: Readonly<Record<Lang, LangRules>>;
}

function promptSet(version: PromptVersion): PromptSet {
  const src: PromptSources = PROMPT_SOURCES[version];
  const lang = (l: Lang) => langRules(version, l, src.lang[l]);
  return {
    safety: safetyRules(version, src.safety),
    kind: { reply: strip(src.reply), polish: strip(src.polish) },
    user: strip(src.user),
    toneCards: sections(src.tones),
    langRules: { en: lang('en'), de: lang('de'), fr: lang('fr'), es: lang('es'), it: lang('it') },
  };
}

export const PROMPT_SETS: Readonly<Record<PromptVersion, PromptSet>> = Object.fromEntries(
  PROMPT_VERSIONS.map((v) => [v, promptSet(v)]),
) as Record<PromptVersion, PromptSet>;

/** Language rules of the version the function sends. */
export const LANG_RULES: Readonly<Record<Lang, LangRules>> = PROMPT_SETS[PROMPT_VERSION].langRules;

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

export function buildPrompt(
  input: PromptInput,
  tag: string = randomTag(),
  version: PromptVersion = PROMPT_VERSION,
): LlmPrompt {
  const set = PROMPT_SETS[version];
  const lang = targetLang(input.langHint, input.uiLang);
  const tone = set.toneCards.get(input.tone);
  if (tone === undefined) throw new Error(`No tone card for ${input.tone}`);

  const rules = set.langRules[lang];
  const group = exampleGroup(input.tone, input.relationship);
  const system = [
    set.safety[input.kind],
    set.kind[input.kind].replaceAll('{{TAG}}', tag),
    rules.rules,
    `Examples (tone group ${group}):\n${rules.examples[group]}`,
    rules.banned,
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
    `address=${ADDRESS[lang][input.formality]}`,
    `i_am=${input.iAm}`,
    `they_are=${input.theyAre}`,
    `language_hint=${input.langHint}`,
    `reply_language=${lang}`,
    `emoji=${emojiAllowed(input.text) ? 'at most one per reply' : 'none'}`,
  ].join('; ');

  // The text can't close the block: the tag is random per request, and any copy of it is removed.
  const text = input.text.replaceAll(tag, '');
  const userTurn = set.user
    .replaceAll('{{SETTINGS}}', settings)
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
