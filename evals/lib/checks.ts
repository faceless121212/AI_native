// Deterministic eval checkers (prompt-engineer agent, "Evals"). Pure functions, no I/O, so they
// run in Deno tests (evals/lib/checks.test.ts). They are deliberately stricter than the
// pipeline's post-check (supabase/functions/_shared/postcheck.ts), which only drops cards that
// are confidently wrong: an eval should flag doubtful output for a human to look at.
import { normalize } from '../../supabase/functions/_shared/postcheck.ts';
import {
  BANNED_PHRASES,
  EXPLICIT_TERMS,
  PET_NAMES,
} from '../../supabase/functions/_shared/prompts/blocklist.v1.ts';
import type { Formality, Lang } from '../../supabase/functions/_shared/schemas.ts';

export const EVAL_LANGS = ['en', 'de', 'fr', 'es', 'it'] as const satisfies readonly Lang[];

// ---------------------------------------------------------------------------------------------
// Phrase matching (same rules as the post-check: case- and accent-insensitive, word boundaries,
// trailing "*" = prefix)

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Entries of `list` found in `text`. */
export function phraseHits(text: string, list: readonly string[]): string[] {
  const norm = normalize(text);
  const hits: string[] = [];
  for (const entry of list) {
    const prefix = entry.endsWith('*');
    const body = escape(normalize(prefix ? entry.slice(0, -1) : entry));
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'u');
    if (re.test(norm)) hits.push(entry);
  }
  return hits;
}

export function explicitHits(text: string): string[] {
  return phraseHits(text, EXPLICIT_TERMS);
}

export function bannedHits(text: string): string[] {
  return phraseHits(text, BANNED_PHRASES);
}

/** Pet names are only a problem early on or at work (spec §4): closeness ≤ 2 or colleague. */
export function petNameHits(
  text: string,
  lang: Lang,
  ctx: { relationship: string; closeness: number },
): string[] {
  if (ctx.closeness > 2 && ctx.relationship !== 'colleague') return [];
  return phraseHits(text, PET_NAMES[lang]);
}

// ---------------------------------------------------------------------------------------------
// Language detector: stop words + characters. Independent lists from the post-check on purpose.

const STOP: Record<Lang, readonly string[]> = {
  en: 'the and you your yours that this what how was were are is it its to of with for have has had i im me my we our so too just thanks thank sounds will would shall about really can could do does did not dont no yes yeah but if when then there here they them be been going want lovely brilliant sorry fancy cheers mate'.split(
    ' ',
  ),
  de: 'der die das den dem des und ist nicht ich du dich dir dein deine deinen sie ihnen ihr ihre wie war mit auch auf fur mich mir schon danke klingt gut diese bei dass ein eine einen wir zu es was noch mal gern gerne leider kann kannst bin hast hab habe wird morgen heute aber oder wenn dann sehr echt doch ja nein vielen'.split(
    ' ',
  ),
  fr: "le la les et est je tu te toi ton ta tes vous votre vos que qui pour avec pas mais des une un merci cette tres bien c'est moi ca aussi suis me nous on du au aux ce sur dans plus si oui non j'ai t'es d'accord demain ai as sont etre fait peux veux".split(
    ' ',
  ),
  es: 'el la los las y es que yo tu te ti usted su para con pero por una un gracias esta muy me mi como tambien estoy se le nos del al lo en mas si no ya hoy manana vale genial bueno puedo quieres tengo tienes hay eso esto pues siento noche contigo cuando donde algo nada todo jaja quedamos'.split(
    ' ',
  ),
  it: 'il lo la gli le e che io tu ti te lei suo sua tuo tua per con non ma una un grazie questa questo quello molto mi come anche sono sei di del della nel nella alla al dal ci bene ho hai cosa va domani oggi stasera allora dai poi se gia piu qui li è vuoi puoi dispiace davvero sempre ancora proprio tutto niente qualcosa perche ciao ahah volentieri magari'.split(
    ' ',
  ),
};

const STOP_SETS = Object.fromEntries(
  EVAL_LANGS.map((l) => [l, new Set(STOP[l].map(normalize))]),
) as Record<Lang, Set<string>>;

const CHAR_HINTS: Record<Lang, RegExp> = {
  en: /\b(?:I'm|I've|I'll|don't|can't|won't|it's|that's)\b/,
  de: /[äöüß]/i,
  fr: /[çœêèëîïûù]|\s[?!;:](?:\s|$)/i,
  es: /[ñ¿¡]/i,
  it: /\p{L}[àòù](?!\p{L})|(?<!\p{L})è(?!\p{L})/iu,
};

export function langScores(text: string): Record<Lang, number> {
  const words = normalize(text)
    .split(/[^\p{L}']+/u)
    .flatMap((w) => (w.includes("'") ? [w, ...w.split("'")] : [w]))
    .filter(Boolean);
  const scores = { en: 0, de: 0, fr: 0, es: 0, it: 0 };
  for (const lang of EVAL_LANGS) {
    for (const w of words) if (STOP_SETS[lang].has(w)) scores[lang]++;
    if (CHAR_HINTS[lang].test(text)) scores[lang] += 2;
  }
  return scores;
}

/** Best language, or null when the text is too short or ambiguous to tell. */
export function detectLang(text: string): Lang | null {
  const scores = langScores(text);
  const ranked = [...EVAL_LANGS].sort((a, b) => scores[b] - scores[a]);
  const [first, second] = ranked as [Lang, Lang];
  if (scores[first] < 2 || scores[first] === scores[second]) return null;
  return first;
}

export type LangVerdict = 'match' | 'unknown' | 'wrong';

export function langVerdict(text: string, expected: Lang): LangVerdict {
  const detected = detectLang(text);
  if (detected === null) return 'unknown';
  return detected === expected ? 'match' : 'wrong';
}

// ---------------------------------------------------------------------------------------------
// Formality markers (agent file: de du/dich/dein vs Sie/Ihnen; fr tu/te/ton vs vous/votre;
// es tú/te vs usted; it tu/ti vs Lei/La). A card may be neutral (no markers); it fails when it
// carries markers of the other register. English: formal must not use slang.

const W = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const rx = (body: string, flags = 'u') => new RegExp(`${W}(?:${body})${E}`, flags);

/** Removes the first word of each sentence so sentence-initial "Sie"/"La" aren't read as formal. */
function midSentence(text: string): string {
  return text.replace(/(^|[.!?¿¡]\s*|\n)\s*\p{L}+/gu, '$1');
}

interface Markers {
  casual: (t: string) => string[];
  formal: (t: string) => string[];
}

function all(re: RegExp, text: string): string[] {
  return [
    ...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)),
  ].map((m) => m[0]);
}

const MARKERS: Record<Lang, Markers> = {
  de: {
    casual: (t) =>
      all(
        rx(
          'du|dich|dir|dein|deine|deinen|deinem|deiner|deines|kannst|hast|bist|willst|magst|weißt|musst|sollst|könntest|hättest',
          'iu',
        ),
        t,
      ),
    // Ihnen anywhere; Sie / Ihr* capitalised mid-sentence (sentence start can be "she/they").
    formal: (t) => [
      ...all(rx('Ihnen'), t),
      ...all(rx('Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres'), midSentence(t)),
    ],
  },
  fr: {
    casual: (t) => [
      ...all(rx("tu|te|toi|ton|ta|tes|t'es|t'as", 'iu'), t),
      ...all(new RegExp(`${W}t'(?=\\p{L})`, 'giu'), t.replace(/’/g, "'")),
    ],
    formal: (t) => all(rx('vous|votre|vos', 'iu'), t),
  },
  es: {
    // Pronouns plus common tú verb forms ("¿Puedes…?" carries tú without a pronoun).
    casual: (t) =>
      all(
        rx(
          'tú|tu|tus|te|ti|contigo|tuyo|tuya|puedes|quieres|tienes|eres|estás|sabes|vienes|vas|haces|dices|necesitas|prefieres|podrías|has|crees|oye|mira|perdona|dime|avísame',
          'iu',
        ),
        t,
      ),
    formal: (t) => all(rx('usted|ustedes', 'iu'), t),
  },
  it: {
    // Pronouns, tu verb forms and tu imperatives (scusa/senti/guarda vs Lei scusi/senta/guardi).
    casual: (t) =>
      all(
        rx(
          'tu|ti|te|tuo|tua|tuoi|tue|sei|hai|vuoi|puoi|sai|chiedi|dimmi|fammi|scrivimi|scusa|senti|guarda',
          'iu',
        ),
        t,
      ),
    // Lei / La / Le / Suo / Sua capitalised mid-sentence, or courtesy formulas anywhere.
    formal: (t) => [
      ...all(rx('Lei|La|Le|Suo|Sua|Suoi|Sue'), midSentence(t)),
      ...all(rx('la ringrazio|le va|le andrebbe|le scrivo|le rispondo|la saluto', 'iu'), t),
    ],
  },
  en: {
    casual: () => [],
    formal: (t) =>
      all(
        rx(
          'gonna|wanna|gotta|ya|u|lol|lmao|omg|haha+|hiya|cheers mate|mate|nah|yep|yeah|bro|dude',
          'iu',
        ),
        t,
      ),
  },
};

/** Markers in `text` that belong to the register opposite to `expected`. */
export function formalityViolations(text: string, lang: Lang, expected: Formality): string[] {
  if (lang === 'en') return expected === 'formal' ? MARKERS.en.formal(text) : [];
  return expected === 'casual' ? MARKERS[lang].formal(text) : MARKERS[lang].casual(text);
}

/** Markers of the expected register (info only: neutral cards are fine). */
export function formalityMarkers(text: string, lang: Lang, expected: Formality): string[] {
  if (lang === 'en') return [];
  return expected === 'casual' ? MARKERS[lang].casual(text) : MARKERS[lang].formal(text);
}

// ---------------------------------------------------------------------------------------------
// Emoji, punctuation, spelling, format

const EMOJI = /\p{Extended_Pictographic}/gu;

export function emojiCount(text: string): number {
  return [...text.matchAll(EMOJI)].length;
}

/** Spec §4: none if the incoming message has none, at most one per card otherwise. */
export function emojiProblem(card: string, incoming: string): string | null {
  const n = emojiCount(card);
  const allowed = emojiCount(incoming) > 0 ? 1 : 0;
  return n > allowed ? `${n} emoji (allowed ${allowed})` : null;
}

/** Spanish: a question or exclamation needs its opening ¿ / ¡. */
export function spanishPunctuationProblem(text: string): string | null {
  const q = (text.match(/\?/g) ?? []).length;
  const iq = (text.match(/¿/g) ?? []).length;
  const e = (text.match(/!/g) ?? []).length;
  const ie = (text.match(/¡/g) ?? []).length;
  if (q > iq) return 'missing ¿';
  if (e > ie) return 'missing ¡';
  return null;
}

/** French: a space (or narrow no-break space) before ? ! ; : (not in times, emoticons, links). */
export function frenchSpacingProblem(text: string): string | null {
  const cleaned = text
    .replace(/\[[a-z]+\]/g, '')
    .replace(/\d:\d/g, '')
    .replace(/[:;][-']?[()DPpOo3*/\\|]/g, '')
    .replace(/https?:\/\/\S+/g, '');
  const m = /[^\s\u00a0\u202f?!;:][?!;:]/u.exec(cleaned);
  return m ? `no space before "${m[0].slice(-1)}"` : null;
}

const US_SPELLINGS = [
  'color',
  'colors',
  'favorite',
  'favorites',
  'realize',
  'realized',
  'organize',
  'organized',
  'apologize',
  'apologized',
  'center',
  'theater',
  'honor',
  'labor',
  'traveling',
  'canceled',
  'mom',
  'vacation',
  'neighbor',
  'behavior',
  'gotten',
  'awesome',
];

export function usSpellingHits(text: string): string[] {
  return phraseHits(text, US_SPELLINGS);
}

/** Things a texting card must never contain (spec §4, architecture §7 output format). */
export function formatProblems(text: string): string[] {
  const problems: string[] = [];
  if (/^\s*(?:\d+[.)]|[-*•])\s/.test(text)) problems.push('numbering or bullet');
  if (/\*\*|__|`|^#+\s/m.test(text)) problems.push('markdown');
  if (/(?<![\p{L}\p{N}&])#\p{L}/u.test(text)) problems.push('hashtag');
  if (/^\s*["“„«']/.test(text) && /["”“»']\s*$/.test(text)) problems.push('wrapped in quotes');
  if (/\b(?:R[1-3]|META|L|W)\|/.test(text)) problems.push('format tag inside text');
  if (/\n/.test(text)) problems.push('line break');
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Distinctness (teardown complaint: repetitive lines) and placeholders

function words(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Jaccard similarity of word sets. */
export function similarity(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Problems when cards are near-duplicates or start with the same two words. */
export function distinctProblems(cards: readonly string[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!;
      const b = cards[j]!;
      if (similarity(a, b) >= 0.6) problems.push(`cards ${i + 1} and ${j + 1} are near-duplicates`);
      const sa = words(a).slice(0, 2).join(' ');
      const sb = words(b).slice(0, 2).join(' ');
      if (sa !== '' && sa === sb && words(a).length > 2) {
        problems.push(`cards ${i + 1} and ${j + 1} start the same ("${sa}")`);
      }
    }
  }
  return problems;
}

const PLACEHOLDER = /\[(?:link|email|iban|card|code|phone)\]/g;

export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[0]).sort();
}

/** Polish must keep every placeholder of the (redacted) draft. */
export function missingPlaceholders(card: string, redactedInput: string): string[] {
  const have = placeholders(card);
  const missing: string[] = [];
  for (const p of placeholders(redactedInput)) {
    const i = have.indexOf(p);
    if (i === -1) missing.push(p);
    else have.splice(i, 1);
  }
  return missing;
}
