// Post-check for each card before it is sent (architecture §7 step 10): length ≤ 300 code points,
// no banned phrase, no explicit term, and the language matches (cheap stop-word heuristic). A
// failing card is dropped; the reason code is logged, never the text.
import { CARD_TEXT_MAX_CHARS, type Lang } from './schemas.ts';
import { BANNED_PHRASES, EXPLICIT_TERMS } from './prompts/blocklist.v1.ts';

export type DropReason = 'empty' | 'too_long' | 'explicit' | 'banned' | 'wrong_lang';

export type PostCheckResult = { ok: true; text: string } | { ok: false; reason: DropReason };

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
 * True when the text is confidently in another of the five languages than `expected`. Short or
 * ambiguous texts pass (no stop words, emoji, names): a wrong drop costs a reply, a missed one
 * only a card in the wrong language.
 */
export function confidentlyOtherLanguage(text: string, expected: Lang): boolean {
  const scores = languageScores(text);
  let best: Lang = expected;
  for (const lang of Object.keys(scores) as Lang[]) if (scores[lang] > scores[best]) best = lang;
  if (best === expected) return false;
  return scores[best] >= 3 && scores[expected] * 3 <= scores[best];
}

/** Strips one pair of wrapping quotes the model may add despite the prompt. */
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

export function postCheckCard(raw: string, expectedLang: Lang | null): PostCheckResult {
  const text = cleanCardText(raw);
  if (text === '') return { ok: false, reason: 'empty' };
  if (Array.from(text).length > CARD_TEXT_MAX_CHARS) return { ok: false, reason: 'too_long' };
  const normalized = normalize(text);
  if (EXPLICIT?.test(normalized)) return { ok: false, reason: 'explicit' };
  if (BANNED?.test(normalized)) return { ok: false, reason: 'banned' };
  if (expectedLang && confidentlyOtherLanguage(text, expectedLang)) {
    return { ok: false, reason: 'wrong_lang' };
  }
  return { ok: true, text };
}
