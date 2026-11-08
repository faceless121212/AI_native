// Emoji rule (spec §4: "match the incoming message: none if it has none, at most one otherwise").
// One rule for the prompt (prompts/index.ts sets `emoji=none|at most one per reply`) and for the
// reply pipeline's deterministic net (reply/pipeline.ts, step 11), which strips what the model
// added anyway. Pure functions; the text never leaves memory.
import type { Lang } from './schemas.ts';

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** Emoji are allowed in the cards when the incoming text (redacted) has a pictograph. */
export function emojiAllowed(incoming: string): boolean {
  return PICTOGRAPH.test(incoming);
}

/** none: strip every emoji; one: keep only the first; keep: leave the card as it is. */
export type EmojiPolicy = 'none' | 'one' | 'keep';

/**
 * Per card. A Polish light edit keeps the draft's own emoji (the eval's rule too); replies and
 * rewrites follow spec §4. With no emoji in the input, nothing gets emoji.
 */
export function emojiPolicy(allowed: boolean, variant: 'reply' | 'light' | 'rewrite'): EmojiPolicy {
  if (!allowed) return 'none';
  return variant === 'light' ? 'keep' : 'one';
}

// One emoji: a flag pair, a keycap, or a pictograph shown as an emoji, with its variation
// selector, skin tone and tag characters, joined by ZWJ to further pieces. A pictograph counts
// only when it has emoji presentation by default (U+1F604) or asks for it with VS16 (U+FE0F) or a
// skin tone (U+2764 U+FE0F, U+261D U+1F3FD): text symbols such as ™ © ® ‼ ↔ ✔ stay, and anything
// followed by VS15 (U+FE0E, text presentation) stays too. Stray pieces (a lone skin tone,
// regional indicator, keycap mark, VS16 or ZWJ) are removed but don't count as an emoji. Escapes
// only: no invisible characters in this file.
const MOD = '(?:\\uFE0F|\\p{Emoji_Modifier}|[\\u{E0020}-\\u{E007F}])*';
const BASE =
  '(?:(?=\\p{Emoji_Presentation})\\p{Extended_Pictographic}(?!\\uFE0E)|\\p{Extended_Pictographic}(?=\\uFE0F|\\p{Emoji_Modifier}))';
const EMOJI_CLUSTER = [
  '\\p{Regional_Indicator}{2}',
  '[0-9#*]\\uFE0F?\\u20E3',
  `${BASE}${MOD}(?:\\u200D(?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})${MOD})*`,
].join('|');
const STRAY = '\\p{Emoji_Modifier}|\\p{Regional_Indicator}|\\u20E3|\\uFE0F|\\u200D';
const TOKEN_SOURCE = `(${EMOJI_CLUSTER})|(?:${STRAY})`;
const TOKEN = new RegExp(TOKEN_SOURCE, 'gu');

/** Number of emoji (a ZWJ family, a flag or a keycap counts as one). */
export function emojiCount(text: string): number {
  let n = 0;
  for (const m of text.matchAll(TOKEN)) if (m[1] !== undefined) n++;
  return n;
}

const HSPACE = new RegExp('[ \\t\\u00A0\\u202F]+$', 'u');
const HSPACE_START = new RegExp('^[ \\t\\u00A0\\u202F]+', 'u');
const CLOSING = /^[.,!?;:…)\]}»]/u;
const OPENING = /[(\[{«¿¡“„]$/u;
const FRENCH_SPACED = /^[?!;:»]/u;
const WORD_END = /[\p{L}\p{N}]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;
/** Bracket and quote pairs removed when stripping leaves them empty ("(😄)", "« 😄 »"). */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['«', '»'],
  ['“', '”'],
  ['„', '“'],
  ['"', '"'],
];

/**
 * Joins the text left and right of a removed emoji: one space between words, no space before
 * closing punctuation (French keeps it before ? ! ; : » and after «), nothing at a line edge.
 * Brackets left empty go too. Newlines are kept; an emoji alone on its line goes with the line.
 */
function join(left: string, right: string, lang: Lang | null): [string, string] {
  const lw = HSPACE.exec(left)?.[0] ?? '';
  const rw = HSPACE_START.exec(right)?.[0] ?? '';
  const l = left.slice(0, left.length - lw.length);
  const r = right.slice(rw.length);
  for (const [open, close] of PAIRS) {
    if (l.endsWith(open) && r.startsWith(close)) {
      return join(l.slice(0, -open.length), r.slice(close.length), lang);
    }
  }
  const space = (lw + rw).charAt(0);
  const atLineStart = l === '' || l.endsWith('\n');
  const atLineEnd = r === '' || r.startsWith('\n');
  if (atLineStart && atLineEnd) return [l, l !== '' && r.startsWith('\n') ? r.slice(1) : r];
  if (atLineStart || atLineEnd) return [l, r];
  const french = lang === 'fr' && space !== '';
  if (CLOSING.test(r)) return french && FRENCH_SPACED.test(r) ? [l + space, r] : [l, r];
  if (OPENING.test(l)) return french && l.endsWith('«') ? [l + space, r] : [l, r];
  if (space !== '') return [l + space, r];
  return WORD_END.test(l) && WORD_START.test(r) ? [`${l} `, r] : [l, r];
}

export interface EmojiResult {
  text: string;
  /** True when something was removed (logged as a text-free `card_fixed {reason:'emoji'}`). */
  changed: boolean;
}

/**
 * Applies the policy to one card. Runs before the other post-checks; a card that is empty
 * afterwards is dropped by the post-check as `empty`. `lang` only decides French spacing.
 */
export function applyEmojiPolicy(
  text: string,
  policy: EmojiPolicy,
  lang: Lang | null = null,
): EmojiResult {
  if (policy === 'keep') return { text, changed: false };
  const token = new RegExp(TOKEN_SOURCE, 'gu');
  let out = text;
  let kept = false;
  let changed = false;
  for (let m = token.exec(out); m !== null; m = token.exec(out)) {
    if (m[1] !== undefined && policy === 'one' && !kept) {
      kept = true; // the first emoji stays; the search continues after it
      continue;
    }
    const [l, r] = join(out.slice(0, m.index), out.slice(m.index + m[0].length), lang);
    out = l + r;
    token.lastIndex = l.length;
    changed = true;
  }
  return changed ? { text: out.trim(), changed: true } : { text, changed: false };
}
