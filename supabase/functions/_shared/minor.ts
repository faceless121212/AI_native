// Deterministic minor check (spec §9: refuse requests that "target a person who appears to be a
// minor", and never flirt with them; safety prompt rule 3: only when the text clearly shows the
// other person is under 18, by an age or a school year; refuse for match or partner). The model's
// safety rules stay the main guard; this is a server-side backstop for when the model misses one
// (evals/safety s-minor-match-de, live run v4).
//
// Precision over recall (decided after review): a refusal before the model must never fire on
// normal date planning ("Samstag, 16?", "Paris, 15", "Demain, 16 ?"). What counts:
//  - a first-person age 10–17 with an age word ("I'm 15 years old", "j'ai 15 ans", "tengo 16
//    años", "ho 16 anni", "ich bin 15 Jahre alt"), or a bare 12–17 after "I'm / ich bin" or, at
//    the end of the clause, after "j'ai / tengo / ho" ("tengo 15", "ho 15 e tu?");
//  - a standalone age with an age word at a sentence start, alone or after a name ("15 yo",
//    "Lena, 16 Jahre", "Hey, Léa, 15 ans");
//  - a bare 12–17 only after an explicit intro and a capitalised name ("I'm Lena, 16", "soy
//    Lucía, 15");
//  - a label ("age: 15", "Alter: 15 Jahre") with nothing else after it;
//  - a first-person school year only minors are in ("Bin in der 9. Klasse", "I'm in year 10",
//    "je suis en 3e", "estoy en 3º de la ESO", "sono in terza media").
// Each must be followed by the end of the clause, an emoji or smiley, or a filler word ("and",
// "lol", "et toi", "wbu"), and not by a count that goes on ("and counting", "y pico", "et 3
// enfants"). Not counted: someone else's age ("my son is 15", "Mi hija, 16 años"), the past ("I
// was 16 when"), durations ("15 minutes", "tengo 15 años trabajando aquí"), "years ago", age
// gaps, experience, prices, brackets ("Lena (16)", "Chapter (16)"), and adults' school words
// ("year 9 of my PhD", "in der 10. Klasse Lehrer"). A missed case still has the model's own rules
// behind it; a false positive costs a refunded reply.
//
// Pure, in memory: the result is a boolean. The text, the age and the matched words are never
// logged, stored or returned. Linear time: blank lines are collapsed and sentence breaks take at
// most 3 spaces, so the lookbehinds stay short (1,000 newlines < 5 ms, minor.test.ts).
import type { Relationship, ReplyKind } from './schemas.ts';

/** Accents stripped, ’ → ', horizontal whitespace collapsed, blank lines collapsed; case kept. */
function foldKeepCase(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’`´]/g, "'")
    .replace(new RegExp('[ \\t\\u00A0\\u202F]+', 'gu'), ' ')
    .replace(new RegExp('\\s*\\n\\s*', 'gu'), '\n');
}

type Lang = 'en' | 'de' | 'fr' | 'es' | 'it';
const LANGS: readonly Lang[] = ['en', 'de', 'fr', 'es', 'it'];

const AGE_WORDS: Record<Lang, string> = {
  en: 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen',
  de: 'zehn|elf|zwolf|dreizehn|vierzehn|funfzehn|sechzehn|siebzehn',
  fr: 'dix|onze|douze|treize|quatorze|quinze|seize|dix[- ]sept',
  es: 'diez|once|doce|trece|catorce|quince|dieciseis|diecisiete',
  it: 'dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette',
};
/** 12–17 only: a bare number with no age word ("I'm 10 lol" is more likely a joke or a score). */
const BARE_AGE_WORDS: Record<Lang, string> = {
  en: 'twelve|thirteen|fourteen|fifteen|sixteen|seventeen',
  de: 'zwolf|dreizehn|vierzehn|funfzehn|sechzehn|siebzehn',
  fr: 'douze|treize|quatorze|quinze|seize|dix[- ]sept',
  es: 'doce|trece|catorce|quince|dieciseis|diecisiete',
  it: 'dodici|tredici|quattordici|quindici|sedici|diciassette',
};
const NUMBER_EDGES = ['(?<![\\p{L}\\p{N}.,:/€$£-])', '(?![\\p{N}]|[.,:/]\\p{N})'] as const;
/** An age 10–17 as a whole number (not 1.5, 15:30, 15/20, 150, €15), before an age word. */
const age = (lang: Lang) => `${NUMBER_EDGES[0]}(?:1[0-7]|${AGE_WORDS[lang]})${NUMBER_EDGES[1]}`;
/** An age 12–17 with no age word after it ("I'm 15", "tengo 15"). */
const bare = (lang: Lang) =>
  `${NUMBER_EDGES[0]}(?:1[2-7]|${BARE_AGE_WORDS[lang]})${NUMBER_EDGES[1]}`;

/** Age words after the number. */
const UNIT: Record<Lang, string> = {
  en: '\\s*(?:yo|y/o|y\\.o\\.?|yrs? old|years? old)(?![\\p{L}])',
  de: '\\s*jahre(?:\\s+alt)?(?![\\p{L}])',
  fr: '\\s*ans(?![\\p{L}])',
  es: '\\s*anos(?![\\p{L}])',
  it: '\\s*anni(?![\\p{L}])',
};

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

/**
 * A count that goes on: "16 and counting", "15 so far", "15 años y pico", "15 anni e passa",
 * "15 ans et 3 enfants", "15 x 3". Not an age statement.
 */
const CONTINUED: Record<Lang, string> = {
  en: 'and\\s+(?:counting|change|up|more)|so\\s+far|or\\s+so|ish|x\\s*\\p{N}',
  de: 'und\\s+(?:mehr|ein\\s+paar)|bisher|oder\\s+so',
  fr: 'et\\s+(?:des\\s+poussieres|plus|quelques)|environ',
  es: 'y\\s+(?:pico|tantos|algo|mas)|o\\s+asi',
  it: 'e\\s+(?:passa|rotti|piu|qualcosa)|o\\s+giu\\s+di\\s+li',
};
const notContinued = (lang: Lang) =>
  `(?!\\s*(?:(?:${CONTINUED[lang]})(?![\\p{L}])|\\+|(?:and|und|et|y|e)\\s+\\p{N}))`;

const MONTHS_EN =
  'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec';
/** Chat words that end the statement whatever follows them ("et toi ?", "wbu", "jaja"). */
const CLOSED_FILLERS: Record<Lang, string> = {
  en: 'lol|haha|lmao|xd|wbu|hbu|u|tho|rn|x',
  de: 'und du|wie alt bist du|lol|haha|xd',
  fr: 'et toi|mdr|ptdr|lol|haha|xd',
  es: 'y tu|jaja|jeje|lol|xd',
  it: 'e tu|ahah|haha|lol|xd',
};
/** Open fillers ("I'm 15 and…", "ich bin 16, aber…", "ho 16 anni e…") plus the closed ones. */
const FILLERS: Record<Lang, string> = {
  en: `${CLOSED_FILLERS.en}|and|so|but|btw|tbh|here|too|though|now|already|yet|omg|how|in\\s+(?:${MONTHS_EN})`,
  de: `${CLOSED_FILLERS.de}|und|aber|also|btw|ubrigens|hier`,
  fr: `${CLOSED_FILLERS.fr}|et|mais|donc|btw|ici`,
  es: `${CLOSED_FILLERS.es}|y|pero|asi`,
  it: `${CLOSED_FILLERS.it}|e|ma|quindi`,
};
/** End of clause, an emoji, or a smiley like ":)" / ":D" (a colon not before a digit). */
const CLAUSE_END = '$|\\n|[.!?,;:)…](?!\\p{N})|\\p{Extended_Pictographic}';
const ender = (lang: Lang, words: string) =>
  `${notContinued(lang)}(?=\\s*(?:${CLAUSE_END}|(?:${words})(?![\\p{L}])))`;
/** End of clause, an emoji or smiley, or any filler word: the age is the whole statement. */
const END = (lang: Lang) => ender(lang, FILLERS[lang]);
/** Stricter, for bare numbers: end of clause, emoji or smiley, or a closed chat filler. */
const END_CLOSED = (lang: Lang) => ender(lang, CLOSED_FILLERS[lang]);

/** Kinship words: "My daughter, 16 years old" / "Sohn, 15 Jahre" are someone else. */
const KIN =
  'son|daughter|brother|sister|kid|child|nephew|niece|cousin|mum|mom|mama|mother|dad|papa|father|sohn|tochter|bruder|schwester|kind|neffe|nichte|mutter|vater|fils|fille|frere|soeur|enfant|neveu|niece|cousine?|mere|pere|hijo|hija|hermano|hermana|nino|nina|sobrino|sobrina|primo|prima|madre|padre|figlio|figlia|fratello|sorella|bambino|bambina|nipote|cugino|cugina';
/**
 * Nouns that get an age at the start of a sentence ("Whisky, 16 years old.", "Hund, 15 Jahre.").
 * Capitalisation can't tell them from a name there (sentence starts and German nouns are
 * capitalised), so this short list is all there is.
 */
const THINGS =
  'whisky|whiskey|scotch|rum|wine|port|cheese|dog|cat|puppy|kitten|horse|car|house|tree|hund|katze|pferd|auto|haus|baum|wein|kase|chien|chat|cheval|voiture|maison|arbre|vin|fromage|perro|gato|caballo|coche|casa|arbol|vino|queso|cane|gatto|cavallo|macchina|albero|formaggio';
/** Days, months and today/tomorrow words: "Samstag, 16 Jahre" is never a person. */
const DATES =
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|yesterday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag|heute|morgen|ubermorgen|gestern|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd|aujourd'hui|demain|hier|lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|ayer|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|oggi|domani|stasera|ieri|" +
  `${MONTHS_EN}|januar|februar|marz|mai|juni|juli|oktober|dezember|janvier|fevrier|mars|avril|juin|juillet|aout|septembre|octobre|novembre|decembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|gennaio|febbraio|aprile|maggio|giugno|luglio|settembre|ottobre|dicembre`;
/** Not names: answers and fillers ("Ok, 16 years ago"), and labels. */
const NOT_NAMES =
  'ok|okay|yes|no|yeah|nope|sure|fine|cool|well|so|and|but|lol|haha|ja|nein|jo|gut|oui|non|bon|bah|merci|si|vale|bueno|claro|gracias|va|bene|ecco|allora|grazie|age|alter|edad|eta|preis|price|prix|precio|prezzo';
const GREETINGS =
  'hi|hey|hello|heya|hiya|yo|hallo|moin|servus|salut|coucou|bonjour|bonsoir|hola|buenas|ciao|salve|buongiorno';
const INTROS =
  "i'?m|i am|my name is|ich bin|ich heisse|je suis|je m'appelle|moi c'est|soy|me llamo|sono|mi chiamo";
/** Sentence start (at most 3 spaces after . ! ?), then optionally a greeting ("Hi,", "Hey"). */
const START = `(?:^|\\n|[.!?]\\s{1,3})(?:(?:${GREETINGS})[,!]?\\s{1,3})?`;
/** One name word, not a kinship word, a thing, a date, a greeting or an answer. */
const NAME = `(?!(?:${KIN}|${THINGS}|${DATES}|${NOT_NAMES}|${GREETINGS})(?![\\p{L}]))[\\p{L}][\\p{L}'-]*`;
/**
 * A standalone age with an age word ("15 yo", "Léa, 15 ans") counts only at the start of a
 * sentence, alone or after a name (an intro may come first: "Moi c'est Léa, 15 ans"): "Anna, 16
 * years old" is the writer; "My daughter, 16 years old" and "Whisky, 16 years old" are not.
 */
const STANDALONE = `(?<=${START}(?:(?:${INTROS})\\s{1,3})?(?:${NAME}\\s*,\\s*)?)`;
const NOT_LETTER_BEFORE = "(?<![\\p{L}'])";
const LABELS: Record<Lang, string> = { en: 'age', de: 'alter', fr: 'age', es: 'edad', it: 'eta' };

const AGE_PATTERNS: readonly RegExp[] = [
  // en: "I'm 15", "im 16 lol", "I am only 14", "I'm 15 years old", "I'm 16yo"
  `${NOT_LETTER_BEFORE}(?:i'?m|i am)\\s+(?:only\\s+|just\\s+|literally\\s+)?(?:${age('en')}${UNIT.en}|${bare('en')})${HALF.en}${END('en')}`,
  // de: "ich bin 16", "bin erst 15", "ich bin 15 Jahre alt"
  `${NOT_LETTER_BEFORE}(?:ich\\s+)?bin\\s+(?:erst\\s+|nur\\s+|gerade\\s+|grad\\s+|schon\\s+)?(?:${age('de')}${HALF.de}${UNIT.de}|${bare('de')}${HALF.de})${END('de')}`,
  // fr / es / it with the age word: "j'ai 15 ans", "tengo 16 años", "ho 16 anni (e mezzo)"
  `${NOT_LETTER_BEFORE}(?:j'ai|j ai|jai)\\s+(?:que\\s+|seulement\\s+|juste\\s+)?${age('fr')}${UNIT.fr}${HALF.fr}${END('fr')}`,
  `${NOT_LETTER_BEFORE}tengo\\s+(?:solo\\s+|solamente\\s+|apenas\\s+|ya\\s+)?${age('es')}${UNIT.es}${HALF.es}${END('es')}`,
  `${NOT_LETTER_BEFORE}ho\\s+(?:solo\\s+|soltanto\\s+|appena\\s+|ancora\\s+)?${age('it')}${UNIT.it}${HALF.it}${END('it')}`,
  // fr / es / it bare, only at the end of a clause or before a chat word: "j'ai 15 et toi ?"
  `${NOT_LETTER_BEFORE}(?:j'ai|j ai|jai)\\s+(?:que\\s+|seulement\\s+)?${bare('fr')}${END_CLOSED('fr')}`,
  `${NOT_LETTER_BEFORE}tengo\\s+(?:solo\\s+|apenas\\s+)?${bare('es')}${END_CLOSED('es')}`,
  `${NOT_LETTER_BEFORE}ho\\s+(?:solo\\s+|appena\\s+)?${bare('it')}${END_CLOSED('it')}`,
  // Standalone with an age word: "15 yo", "Anna, 16 years old", "Hey, Lena, 16 Jahre"
  ...LANGS.map((l) => `${STANDALONE}${age(l)}${UNIT[l]}${END(l)}`),
  // A label: "age: 15", "Lena, age: 16", "Alter: 15 Jahre", "edad: 15", "età: 15"
  ...LANGS.map((l) => `${STANDALONE}${LABELS[l]}\\s*:\\s*${age(l)}(?:${UNIT[l]})?${END(l)}`),
].map((source) => new RegExp(source, 'u'));

/**
 * A bare 12–17 after an explicit intro and a name: "I'm Lena, 16", "Hi, I'm Lena, 16", "soy
 * Lucía, 15", "sono Giulia, 16". The name must be capitalised in the message (checked on the
 * raw case, via the `name` group), so "sono stanca, 16" or "im lena, 16" don't count.
 */
const INTRO_NAME_PATTERNS: readonly RegExp[] = LANGS.map(
  (l) =>
    new RegExp(
      `(?<=${START})(?:${INTROS})\\s{1,3}(?<name>${NAME})\\s*,\\s*${bare(l)}${END_CLOSED(l)}`,
      'du',
    ),
);

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

function introWithCapitalisedName(lower: string, keepCase: string): boolean {
  if (lower.length !== keepCase.length) return false; // case mapping changed the length: skip
  for (const re of INTRO_NAME_PATTERNS) {
    const match = re.exec(lower);
    const start = match?.indices?.groups?.name?.[0];
    if (start !== undefined && /\p{Lu}/u.test(keepCase.charAt(start))) return true;
  }
  return false;
}

/** True when the text, in the first person, states an age under 18 or a minor's school year. */
export function statesMinor(text: string): boolean {
  const keepCase = foldKeepCase(text);
  const folded = keepCase.toLowerCase();
  return (
    AGE_PATTERNS.some((re) => re.test(folded)) ||
    SCHOOL_PATTERNS.some((re) => re.test(folded)) ||
    introWithCapitalisedName(folded, keepCase)
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
