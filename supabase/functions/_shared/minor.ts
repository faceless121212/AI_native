// Deterministic minor check (spec §9: refuse requests that "target a person who appears to be a
// minor", and never flirt with them; safety prompt rule 3: only when the text clearly shows the
// other person is under 18, by an age or a school year; refuse for match or partner). The model
// usually gets this right on its own; this is the server-side net for when it doesn't
// (evals/safety s-minor-match-de, live run v4).
//
// Conservative on purpose: only a first-person statement of an age 10–17 ("I'm 15", "ich bin
// 16", "j'ai 15 ans", "tengo 16 años", "ho 16 anni", "15 yo", "Lena, 16 Jahre"), or a first-person
// school year only minors are in ("Bin in der 9. Klasse", "I'm in year 10", "je suis en 3e",
// "estoy en 3º de la ESO", "sono in terza media"), followed by the end of the clause, an emoji or
// a filler word ("and", "lol", …). Someone else's age ("my son is 15", "Mi hija, 16 años"), the
// past ("I was 16 when"), durations ("15 minutes", "tengo 15 años trabajando aquí"), "years
// ago", age gaps, experience, prices and school words of adults ("year 9 of my PhD", "in der 10.
// Klasse Lehrer") don't count. A missed case still has the model's own refusal behind it; a false
// positive costs a refunded reply.
//
// Pure, in memory: the result is a boolean. The text, the age and the matched words are never
// logged, stored or returned.
import type { Relationship, ReplyKind } from './schemas.ts';

/** Lowercase, accents stripped, ’ → ', horizontal whitespace collapsed (newlines kept). */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(new RegExp('[ \\t\\u00A0\\u202F]+', 'gu'), ' ');
}

type Lang = 'en' | 'de' | 'fr' | 'es' | 'it';

const AGE_WORDS: Record<Lang, string> = {
  en: 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen',
  de: 'zehn|elf|zwolf|dreizehn|vierzehn|funfzehn|sechzehn|siebzehn',
  fr: 'dix|onze|douze|treize|quatorze|quinze|seize|dix[- ]sept',
  es: 'diez|once|doce|trece|catorce|quince|dieciseis|diecisiete',
  it: 'dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette',
};
/** An age 10–17 as a whole number (not 1.5, 15:30, 15/20, 150, €15). */
const age = (lang: Lang) =>
  `(?<![\\p{L}\\p{N}.,:/€$£-])(?:1[0-7]|${AGE_WORDS[lang]})(?![\\p{N}]|[.,:/]\\p{N})`;

/**
 * "… and a half": part of the age, so what follows it decides ("e mezzo di esperienza"). Atomic:
 * either consumed or not there, so "y" of "y medio" can't pass as a filler on backtracking.
 */
const HALF_PHRASE: Record<Lang, string> = {
  en: '\\s+and\\s+a\\s+half',
  de: '\\s*einhalb|\\s+und\\s+(?:ein\\s+)?halb',
  fr: '\\s+et\\s+demi',
  es: '\\s+y\\s+medio',
  it: '\\s+e\\s+mezzo',
};
const HALF = Object.fromEntries(
  Object.entries(HALF_PHRASE).map(([lang, h]) => [lang, `(?:(?:${h})(?![\\p{L}])|(?!(?:${h})))`]),
) as Record<Lang, string>;

/** Words that may follow the statement ("I'm 15 and…", "ich bin 16, aber…", "ho 16 anni e…"). */
const FILLERS: Record<Lang, string> = {
  en: 'and|so|but|lol|haha|ha|btw|tbh|here|too|though|now|already|yet|lmao|omg|xd',
  de: 'und|aber|also|lol|haha|btw|ubrigens|hier',
  fr: 'et|mais|donc|mdr|lol|ptdr|haha|btw|ici',
  es: 'y|pero|asi|jaja|jeje|lol|xd',
  it: 'e|ma|quindi|ahah|haha|lol|xd',
};
/** End of clause, an emoji, or a filler word: the age (or school year) is the whole statement. */
const END = (lang: Lang) =>
  `(?=\\s*(?:$|\\n|[.!?,;:)…](?!\\p{N})|\\p{Extended_Pictographic}|(?:${FILLERS[lang]})(?![\\p{L}])))`;

/** Kinship words: "My daughter, 16 years old" / "Sohn, 15 Jahre" are someone else. */
const KIN =
  'son|daughter|brother|sister|kid|child|nephew|niece|cousin|sohn|tochter|bruder|schwester|kind|neffe|nichte|fils|fille|frere|soeur|enfant|neveu|niece|cousine?|hijo|hija|hermano|hermana|nino|nina|sobrino|sobrina|primo|prima|figlio|figlia|fratello|sorella|bambino|bambina|nipote|cugino|cugina';
/**
 * A standalone age ("15 yo", "Léa, 15 ans") counts only at the start of a sentence, alone or
 * after one name: "Anna, 16 years old" is the writer; "My daughter, 16 years old" is not.
 */
const STANDALONE = `(?<=(?:^|\\n|[.!?]\\s+)(?:[\\p{L}'-]+\\s*,\\s*)?)(?<!(?:^|[^\\p{L}])(?:${KIN})\\s*,\\s*)`;
const NOT_LETTER_BEFORE = "(?<![\\p{L}'])";

const AGE_PATTERNS: readonly RegExp[] = [
  // en: "I'm 15", "im 16 lol", "I am only 14", "I'm 15 years old", "I'm 16yo"
  `${NOT_LETTER_BEFORE}(?:i'?m|i am)\\s+(?:only\\s+|just\\s+|literally\\s+)?${age('en')}(?:\\s*(?:yo|y/o|y\\.o\\.?|yrs? old|years? old)(?![\\p{L}]))?${HALF.en}${END('en')}`,
  // en: "15 yo", "Anna, 16 years old"
  `${STANDALONE}${age('en')}\\s*(?:yo|y/o|y\\.o\\.?|yrs? old|years? old)(?![\\p{L}])${END('en')}`,
  // de: "ich bin 16", "bin erst 15", "ich bin 15 Jahre alt"
  `${NOT_LETTER_BEFORE}(?:ich\\s+)?bin\\s+(?:erst\\s+|nur\\s+|gerade\\s+|grad\\s+|schon\\s+)?${age('de')}${HALF.de}(?:\\s*jahre(?:\\s+alt)?(?![\\p{L}]))?${END('de')}`,
  // de: "Lena, 16 Jahre (alt)"
  `${STANDALONE}${age('de')}\\s*jahre(?:\\s+alt)?(?![\\p{L}])${END('de')}`,
  // fr: "j'ai 15 ans", "j'ai que 16 ans", "jai 14 ans (et demi)"
  `${NOT_LETTER_BEFORE}(?:j'ai|j ai|jai)\\s+(?:que\\s+|seulement\\s+|juste\\s+)?${age('fr')}\\s*ans(?![\\p{L}])${HALF.fr}${END('fr')}`,
  `${STANDALONE}${age('fr')}\\s*ans(?![\\p{L}])${END('fr')}`,
  // es: "tengo 16 años", "yo tengo solo 15 años"
  `${NOT_LETTER_BEFORE}tengo\\s+(?:solo\\s+|solamente\\s+|apenas\\s+|ya\\s+)?${age('es')}\\s*anos(?![\\p{L}])${HALF.es}${END('es')}`,
  `${STANDALONE}${age('es')}\\s*anos(?![\\p{L}])${END('es')}`,
  // it: "ho 16 anni", "io ho solo 15 anni (e mezzo)"
  `${NOT_LETTER_BEFORE}ho\\s+(?:solo\\s+|soltanto\\s+|appena\\s+|ancora\\s+)?${age('it')}\\s*anni(?![\\p{L}])${HALF.it}${END('it')}`,
  `${STANDALONE}${age('it')}\\s*anni(?![\\p{L}])${END('it')}`,
].map((source) => new RegExp(source, 'u'));

const SCHOOL_PATTERNS: readonly RegExp[] = [
  // de: "(ich) bin (erst) in der 9. Klasse", "ich gehe in die 10. Klasse" (classes 5–10)
  `${NOT_LETTER_BEFORE}(?:ich\\s+)?(?:bin|geh|gehe)\\s+(?:(?:erst|noch|jetzt|gerade)\\s+)*in\\s+(?:der|die)\\s+(?:(?:[5-9]|10)\\.?\\s*|(?:funfte|sechste|siebte|achte|neunte|zehnte)n?\\s+)klasse(?![\\p{L}])${END('de')}`,
  // en: "I'm in year 10" (UK years 7–11), "I'm in 9th grade" (grades 6–10)
  `${NOT_LETTER_BEFORE}(?:i'?m|i am)\\s+(?:only\\s+|just\\s+|still\\s+)?in\\s+(?:year\\s+(?:[7-9]|1[01])|(?:[6-9]|10)(?:th)?\\s+grade|(?:sixth|seventh|eighth|ninth|tenth)\\s+grade|grade\\s+(?:[6-9]|10))(?![\\p{L}\\p{N}])${END('en')}`,
  // fr: "je suis en 3e / en seconde" (collège and seconde)
  `${NOT_LETTER_BEFORE}(?:je suis|j'suis|chui)\\s+en\\s+(?:[3-6](?:e|eme)|seconde|2nde|sixieme|cinquieme|quatrieme|troisieme)(?![\\p{L}])${END('fr')}`,
  // es: "estoy en 3º de la ESO", "voy a tercero de ESO"
  `${NOT_LETTER_BEFORE}(?:estoy|voy)\\s+(?:en|a)\\s+(?:[1-4]\\s*(?:o|°)?|primero|segundo|tercero|cuarto)\\s+(?:de\\s+)?(?:la\\s+)?eso(?![\\p{L}])${END('es')}`,
  // it: "sono in terza media", "faccio la seconda superiore"
  `${NOT_LETTER_BEFORE}(?:sono|vado|faccio)\\s+(?:(?:in|la|alla|il)\\s+)?(?:prima|seconda|terza)\\s+(?:media|superiore)(?![\\p{L}])${END('it')}`,
].map((source) => new RegExp(source, 'u'));

/** True when the text, in the first person, states an age under 18 or a minor's school year. */
export function statesMinor(text: string): boolean {
  const folded = fold(text);
  return (
    AGE_PATTERNS.some((re) => re.test(folded)) || SCHOOL_PATTERNS.some((re) => re.test(folded))
  );
}

/**
 * Server-side refusal before the model call: a reply (someone else's message) to a match or a
 * partner whose message states they are under 18. Polish is the user's own draft (age confirmed
 * 18+) and other relationships are not dating (they get no flirting instead, see the handler).
 * The caller skips the refusal for a crisis message (CLAUDE.md rule 7: supportive replies and
 * the crisis card).
 */
export function minorInDatingContext(input: {
  kind: ReplyKind;
  relationship: Relationship;
  text: string;
}): boolean {
  if (input.kind !== 'reply') return false;
  if (input.relationship !== 'match' && input.relationship !== 'partner') return false;
  return statesMinor(input.text);
}
