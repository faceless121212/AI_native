// Post-check for each card before it is sent (architecture §7 step 11): emoji first (spec §4:
// stripped to none or to the first one, see emoji.ts), then length ≤ 300 code points, no banned
// phrase, no explicit term, and the language matches (cheap stop-word heuristic, plus Spanish /
// Italian markers). A failing card is dropped; the reason code is logged, never the text. The
// pipeline also drops a reply card that repeats an earlier one (repeatsCard: same first three
// words, or the same words); the evals flag the stricter two-word rule (sameOpener). Polish cards
// may contain newlines (unescaped by llm/lines.ts): each counts as one character, and list
// matching sees it as a space, so a banned phrase split over two lines is still caught.
import { applyEmojiPolicy, type EmojiPolicy } from './emoji.ts';
import { CARD_TEXT_MAX_CHARS, type Lang } from './schemas.ts';
import { BANNED_PHRASES, EXPLICIT_TERMS } from './prompts/blocklist.v1.ts';

export type DropReason =
  'empty' | 'too_long' | 'explicit' | 'banned' | 'wrong_lang' | 'same_opener' | 'duplicate';

/** What the post-check changed in a card it kept (logged as `card_fixed`, never the text). */
export type FixReason = 'emoji';

export type PostCheckResult =
  { ok: true; text: string; fixed?: FixReason } | { ok: false; reason: DropReason };

export interface PostCheckOptions {
  /** Emoji rule for this card (emoji.ts emojiPolicy); default 'keep'. */
  emoji?: EmojiPolicy;
  /**
   * Language the copied message or draft is confidently in (dominantLanguage), if any. A card in
   * that language is never dropped as wrong_lang (spec §3.3: replies follow the message), even
   * when META is late, missing or wrong and the on-device hint was wrong (live run
   * it-wrong-hint-es: every Italian card was checked against the hint es and dropped).
   */
  messageLang?: Lang | null;
}

/** Lowercase, strip accents, collapse whitespace. Used for list matching and language scoring. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(entries: readonly string[]): RegExp | null {
  if (entries.length === 0) return null;
  const parts = entries.map((entry) => {
    const prefix = entry.endsWith('*');
    const body = escape(normalize(prefix ? entry.slice(0, -1) : entry));
    return prefix ? `${body}` : `${body}(?![\\p{L}\\p{N}])`;
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})`, 'u');
}

const EXPLICIT = compile(EXPLICIT_TERMS);
const BANNED = compile(BANNED_PHRASES);

const STOP_WORDS: Record<Lang, readonly string[]> = {
  en: [
    'the',
    'and',
    'you',
    'your',
    'that',
    'this',
    'what',
    'how',
    'was',
    'are',
    'is',
    'it',
    'to',
    'of',
    'with',
    'for',
    'have',
    'i',
    "i'm",
    'my',
    'me',
    'we',
    'so',
    'too',
    'just',
    'thanks',
    'thank',
    'sounds',
    'will',
    'shall',
    'about',
  ],
  de: [
    'der',
    'die',
    'das',
    'und',
    'ist',
    'nicht',
    'ich',
    'du',
    'dich',
    'dir',
    'dein',
    'deine',
    'sie',
    'ihnen',
    'ihre',
    'wie',
    'war',
    'mit',
    'auch',
    'auf',
    'fur',
    'mich',
    'mir',
    'schon',
    'danke',
    'klingt',
    'gut',
    'diese',
    'bei',
    'dass',
    'ein',
    'eine',
    'wir',
    'zu',
  ],
  fr: [
    'le',
    'la',
    'les',
    'et',
    'est',
    'je',
    'tu',
    'te',
    'toi',
    'ton',
    'ta',
    'vous',
    'votre',
    'que',
    'qui',
    'pour',
    'avec',
    'pas',
    'mais',
    'des',
    'une',
    'un',
    'merci',
    'cette',
    'tres',
    'bien',
    "c'est",
    'moi',
    'ca',
    'aussi',
    'suis',
    'me',
    'nous',
  ],
  es: [
    'el',
    'la',
    'los',
    'las',
    'y',
    'es',
    'que',
    'yo',
    'tu',
    'te',
    'ti',
    'usted',
    'su',
    'para',
    'con',
    'pero',
    'por',
    'una',
    'un',
    'gracias',
    'esta',
    'muy',
    'me',
    'mi',
    'como',
    'que',
    'tambien',
    'estoy',
    'se',
    'le',
    'nos',
    'del',
  ],
  it: [
    'il',
    'lo',
    'la',
    'gli',
    'le',
    'e',
    'che',
    'io',
    'tu',
    'ti',
    'te',
    'lei',
    'suo',
    'tuo',
    'per',
    'con',
    'non',
    'ma',
    'una',
    'un',
    'grazie',
    'questa',
    'molto',
    'mi',
    'come',
    'anche',
    'sono',
    'sei',
    'di',
    'del',
    'ci',
    'bene',
  ],
};

const STOP_SETS: Record<Lang, Set<string>> = Object.fromEntries(
  Object.entries(STOP_WORDS).map(([lang, words]) => [lang, new Set(words.map(normalize))]),
) as Record<Lang, Set<string>>;

/** Characters that point to one language (checked on the raw text). */
const CHAR_HINTS: Record<Lang, RegExp> = {
  en: /$^/,
  de: /[äöüß]/i,
  fr: /[çœêèëîïûù]|\s[?!;:]/i,
  es: /[ñ¿¡]/i,
  it: /\b\p{L}+[àòù](?!\p{L})/iu,
};

export function languageScores(text: string): Record<Lang, number> {
  const words = normalize(text)
    .split(/[^\p{L}']+/u)
    .flatMap((w) => (w.includes("'") ? [w, ...w.split("'")] : [w]))
    .filter(Boolean);
  const scores = { en: 0, de: 0, fr: 0, es: 0, it: 0 } as Record<Lang, number>;
  for (const lang of Object.keys(scores) as Lang[]) {
    for (const w of words) if (STOP_SETS[lang].has(w)) scores[lang]++;
    if (CHAR_HINTS[lang].test(text)) scores[lang] += 2;
  }
  return scores;
}

/**
 * Words and characters that tell Spanish and Italian apart (the stop-word lists overlap a lot:
 * la, te, tu, me, un, una, con …). Matched on the lowercased raw text, accents kept (tú, è).
 */
const ES_IT_MARKERS: Record<'es' | 'it', { words: ReadonlySet<string>; chars?: RegExp }> = {
  es: {
    words: new Set(['y', 'el', 'lo', 'tú', 'que', 'qué', 'yo', 'muy', 'los', 'las', 'pero']),
    chars: /[ñ¿¡]/gu,
  },
  it: {
    words: new Set(['e', 'il', 'che', 'sono', 'è', 'io', 'gli', 'non', 'anche', 'perché', 'ci']),
  },
};

export function esItMarkers(text: string): Record<'es' | 'it', number> {
  const lower = text.normalize('NFC').toLowerCase();
  const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
  const count = (lang: 'es' | 'it') => {
    const m = ES_IT_MARKERS[lang];
    const chars = m.chars ? (lower.match(m.chars)?.length ?? 0) : 0;
    return words.filter((w) => m.words.has(w)).length + chars;
  };
  return { es: count('es'), it: count('it') };
}

/**
 * Spanish card for "it" or Italian card for "es": at least 2 markers of the other language, 3×
 * as many as of the expected one, and the stop words don't favour the expected language.
 */
function confidentlyEsItSwap(text: string, expected: Lang, scores: Record<Lang, number>): boolean {
  if (expected !== 'es' && expected !== 'it') return false;
  const other = expected === 'es' ? 'it' : 'es';
  const m = esItMarkers(text);
  return m[other] >= 2 && m[other] >= 3 * m[expected] && scores[other] >= scores[expected];
}

/**
 * True when the text is confidently in another of the five languages than `expected`. Short or
 * ambiguous texts pass (no stop words, emoji, names): a wrong drop costs a reply, a missed one
 * only a card in the wrong language.
 */
export function confidentlyOtherLanguage(text: string, expected: Lang): boolean {
  const scores = languageScores(text);
  if (confidentlyEsItSwap(text, expected, scores)) return true;
  let best: Lang = expected;
  for (const lang of Object.keys(scores) as Lang[]) if (scores[lang] > scores[best]) best = lang;
  if (best === expected) return false;
  return scores[best] >= 3 && scores[expected] * 3 <= scores[best];
}

/**
 * The language the text is confidently in: the best-scoring one, when the text is confidently
 * not in each of the other four. Null for short, mixed or neutral texts.
 */
export function dominantLanguage(text: string): Lang | null {
  const scores = languageScores(text);
  const langs = Object.keys(scores) as Lang[];
  let best: Lang = langs[0]!;
  for (const lang of langs) if (scores[lang] > scores[best]) best = lang;
  return langs.every((lang) => lang === best || confidentlyOtherLanguage(text, lang)) ? best : null;
}

/**
 * Strips one pair of wrapping quotes the model may add despite the prompt. Only the ends are
 * trimmed: newlines inside a Polish card are kept.
 */
export function cleanCardText(raw: string): string {
  let text = raw.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['„', '“'],
    ['«', '»'],
    ["'", "'"],
  ];
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, -close.length);
      if (!inner.includes(open) && !inner.includes(close)) text = inner.trim();
      break;
    }
  }
  return text;
}

/** Normalised words of a card (the evals' distinctness checks use the same split). */
export function cardWords(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/**
 * Eval rule (evals/lib/checks.ts distinctProblems): true when `later` starts with the same two
 * normalised words as `earlier`, and `earlier` has more than 2 words (a short card like "Sounds
 * great!" has no opener to repeat). Stricter than the pipeline (repeatsCard) on purpose: the eval
 * flags for a human, the pipeline costs the user a card.
 */
export function sameOpener(earlier: string, later: string): boolean {
  const a = cardWords(earlier);
  if (a.length <= 2) return false;
  return a.slice(0, 2).join(' ') === cardWords(later).slice(0, 2).join(' ');
}

/**
 * Pipeline rule: why a later reply card is dropped as a repeat of an earlier one, or null.
 * 'duplicate': the same normalised words (any length); 'same_opener': both have at least three
 * words and the first three are the same. Two shared words ("Sounds great, …") are kept: live,
 * the two-word rule cost it-pair-formal a card.
 */
export function repeatsCard(earlier: string, later: string): 'duplicate' | 'same_opener' | null {
  const a = cardWords(earlier);
  const b = cardWords(later);
  if (a.join(' ') === b.join(' ')) return 'duplicate';
  if (a.length >= 3 && b.length >= 3 && a.slice(0, 3).join(' ') === b.slice(0, 3).join(' ')) {
    return 'same_opener';
  }
  return null;
}

export function postCheckCard(
  raw: string,
  expectedLang: Lang | null,
  maxChars: number = CARD_TEXT_MAX_CHARS,
  opts: PostCheckOptions = {},
): PostCheckResult {
  // Emoji first, so the clean-up, the length and the other checks see the final card.
  const emoji = applyEmojiPolicy(raw, opts.emoji ?? 'keep', expectedLang);
  const text = cleanCardText(emoji.text);
  if (text === '') return { ok: false, reason: 'empty' };
  if (Array.from(text).length > maxChars) return { ok: false, reason: 'too_long' };
  const normalized = normalize(text);
  if (EXPLICIT?.test(normalized)) return { ok: false, reason: 'explicit' };
  if (BANNED?.test(normalized)) return { ok: false, reason: 'banned' };
  const messageLang = opts.messageLang ?? null;
  if (
    expectedLang &&
    confidentlyOtherLanguage(text, expectedLang) &&
    (messageLang === null ||
      messageLang === expectedLang ||
      confidentlyOtherLanguage(text, messageLang))
  ) {
    return { ok: false, reason: 'wrong_lang' };
  }
  return emoji.changed ? { ok: true, text, fixed: 'emoji' } : { ok: true, text };
}
