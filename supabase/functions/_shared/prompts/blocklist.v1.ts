// Post-check lists (architecture §7 step 11), v1. Owned by prompt-engineer.
// A card containing any entry of EXPLICIT_TERMS or BANNED_PHRASES is dropped by postcheck.ts.
// Matching is case- and accent-insensitive on word boundaries; a trailing "*" matches a prefix.
// Lists apply to every card in every language, so an entry must be wrong in ALL five languages
// and ALL settings (no pet names here: they are fine between partners; see PET_NAMES).
// Keep entries lowercase; write real letters (ä, é, ñ): entries are normalised like the text. Never put user text here. Never weaken an entry to make an eval pass.
//
// Sources: spec §4 and §9, prompt-engineer agent rules. The teardown (docs/teardown.md) was not
// available when v1 was written; add its examples here and in lang/<lang>.v1.md once it is.

/** Explicit terms (spec §9: no sexual or explicit replies at any setting; Apple 1.1.4). */
export const EXPLICIT_TERMS: readonly string[] = [
  // Test sentinel used by the fake provider's "explicit" scenario. Keep.
  'xxx-explicit-term',
  // en
  'send nudes',
  'nudes',
  'nude pic*',
  'naked pic*',
  'dick pic*',
  'sexting',
  'sext',
  'horny',
  'blowjob*',
  'blow job*',
  'handjob*',
  'orgasm*',
  'porn*',
  'nsfw',
  'boobs',
  'your tits',
  'show me your tits',
  'pussy',
  'sex tonight',
  'have sex',
  'sex with you',
  'in bed with you',
  'take your clothes off',
  'get naked',
  // de
  'nacktbild*',
  'nacktfoto*',
  'nacktselfie*',
  'titten',
  'ficken',
  'fickst',
  'fick dich',
  'bumsen',
  'porno*',
  'sex mit dir',
  'mit dir schlafen',
  'zieh dich aus',
  // fr
  'photos nues',
  'photo nue',
  'photo de toi nue',
  'nudes de toi',
  'baiser avec toi',
  'te baiser',
  'coucher avec toi',
  'te voir a poil',
  'mets-toi a poil',
  'photo a poil',
  'branler',
  'sodomi*',
  // es
  'fotos desnud*',
  'foto desnud*',
  'follar*',
  'follarte',
  'follamos',
  'polla',
  'tetas',
  'mamada*',
  'hacer que te corras',
  'correrte dentro',
  'me pones cachond*',
  'estoy cachond*',
  'acostarme contigo',
  'desnudate',
  // it
  'foto nud*',
  'scopare con te',
  'ti voglio scopare',
  'scoparti',
  'scopiamo',
  'pompino*',
  'tette',
  'succhiami',
  'arrapat*',
  'fare sesso',
  'venire a letto con te',
  'spogliati',
];

/**
 * Phrases that break "sounds like a real person", the no-coach-persona rule, or are pick-up-line
 * clichés, greasy lines or passive-aggressive phrasing in any setting (spec §4, §9).
 */
export const BANNED_PHRASES: readonly string[] = [
  // AI / bot / coach persona (all languages)
  'as an ai',
  'as a language model',
  "i'm an ai",
  'i am an ai',
  'ai assistant',
  'dating coach',
  'als ki',
  'als sprachmodell',
  'ich bin eine ki',
  "en tant qu'ia",
  'en tant que modele de langage',
  'je suis une ia',
  'como ia',
  'como modelo de lenguaje',
  'soy una ia',
  'come ia',
  'come modello linguistico',
  'sono un ia',
  "sono un'ia",
  // en: pick-up clichés, greasy lines, passive-aggressive phrasing
  'did it hurt when you fell',
  'fell from heaven',
  'are you a magician',
  'are you a parking ticket',
  'you must be tired because',
  'is your name google',
  'netflix and chill',
  'hey sexy',
  "you're not like other girls",
  'not like other girls',
  'per my last email',
  'per my last message',
  'as per my last',
  'as i already said',
  'no offence but',
  'no offense but',
  'i hope this message finds you well',
  'i hope this email finds you well',
  // de
  'vom himmel gefallen bist',
  'bist du ein zauberer',
  'na schone frau',
  'na, schone frau',
  'na hubsche',
  'na, hubsche',
  'wie bereits erwahnt',
  'wie ich schon sagte',
  'nicht bose gemeint, aber',
  'ich hoffe, diese nachricht erreicht dich',
  'ich hoffe, diese nachricht erreicht sie',
  // fr
  'tombee du ciel',
  "t'es pas comme les autres",
  "tu n'es pas comme les autres filles",
  "comme je te l'ai deja dit",
  "comme je vous l'ai deja dit",
  'sans vouloir te vexer',
  "j'espere que ce message te trouve",
  "j'espere que ce message vous trouve",
  // es
  'caiste del cielo',
  'te dolio cuando caiste',
  'como ya te dije',
  'como ya le dije',
  'no te ofendas, pero',
  'espero que este mensaje te encuentre',
  'espero que este mensaje le encuentre',
  // it
  'caduta dal cielo',
  'come ti ho gia detto',
  'come le ho gia detto',
  'senza offesa, ma',
  'spero che questo messaggio ti trovi',
  'spero che questo messaggio la trovi',
];

/**
 * Pet names: never to someone the user just met (closeness 1–2), a colleague or family member
 * by default (spec §4). Fine between partners, so postcheck does not drop them; the evals check
 * them per case and the lang files tell the model. Suggested backend follow-up: drop cards with
 * these when closeness ≤ 2 or relationship is colleague.
 */
export const PET_NAMES: Readonly<Record<'en' | 'de' | 'fr' | 'es' | 'it', readonly string[]>> = {
  en: ['babe', 'baby', 'hun', 'honey', 'sweetie', 'sweetheart', 'darling', 'gorgeous', 'princess'],
  de: ['schatz', 'schatzi', 'baby', 'babe', 'süße', 'hase', 'hasi', 'mausi', 'mäuschen'],
  fr: ['bébé', 'mon cœur', 'ma belle', 'mon chou', 'ma chérie', 'mon chéri', 'chouchou'],
  es: ['cariño', 'preciosa', 'mi amor', 'mi cielo', 'mi vida', 'nena', 'guapísima'],
  it: [
    'amore mio',
    'ciao amore',
    'tesoro',
    'tesorino',
    'dolcezza',
    'baby',
    'bella mia',
    'piccola mia',
  ],
};
