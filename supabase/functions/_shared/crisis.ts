// Crisis backstop (spec §9; privacy review): a deterministic check of the (redacted) input for
// phrases that suggest self-harm, suicide or immediate danger, in all five languages. The model's
// META.crisis is the primary signal; this only fills the gap when META is missing, the provider
// refused, or the stream ended early, so the client still shows the crisis card.
//
// The result is a boolean used for the SSE `meta` event only: it is never stored, logged or sent
// to analytics. Lists reviewed by prompt-engineer in Prompt 4; they lean to recall (see below). Matching: lowercase, accents stripped,
// word boundaries; a trailing "*" matches a word prefix.
import { normalize } from './postcheck.ts';

export const CRISIS_PHRASES: Readonly<Record<'en' | 'de' | 'fr' | 'es' | 'it', readonly string[]>> =
  {
    // Reviewed by prompt-engineer (Prompt 4, after code review). The backstop only runs when the
    // model's META is missing, the provider refused, or the stream ended early, i.e. exactly the
    // cases where nothing else shows the 112 card. So it leans to recall: a false positive costs
    // one extra crisis card, a false negative means no card. Idioms like "my mum is going to kill
    // me" or "questo caldo mi ammazza" match on purpose; only unambiguous everyday phrases are
    // excluded (CRISIS_EXCEPTIONS below, and no bare "cortarme"/"tagliarmi": haircuts). Verify
    // with native speakers before launch.
    en: [
      'suicide',
      'suicidal',
      'kill myself',
      'killing myself',
      'unalive myself',
      'end my life',
      'ending my life',
      'take my own life',
      'end it all',
      'ending it all',
      'want to die',
      'wanna die',
      'wish i was dead',
      'wish i were dead',
      "don't want to live",
      'dont want to live',
      "don't want to be here anymore",
      "don't want to wake up",
      'no reason to live',
      'no point in living',
      'better off dead',
      'better off without me',
      'self harm',
      'self-harm',
      'hurt myself',
      'hurting myself',
      'cut myself',
      'cutting myself',
      'overdose',
      'going to kill me',
      'gonna kill me',
      'will kill me',
      "'ll kill me",
      'threatening to kill',
      'threatened to kill me',
      'scared for my life',
      'fear for my life',
      "i'm in danger",
      'i am in danger',
      "i'm not safe",
    ],
    de: [
      'suizid*',
      'selbstmord*',
      'mich umbringen',
      'mich umzubringen',
      'bringt mich um',
      'bring mich um',
      'mich toten',
      'mich zu toten',
      'mir das leben nehmen',
      'mir das leben zu nehmen',
      'will sterben',
      'sterben will',
      'mochte sterben',
      'nicht mehr leben',
      'will nicht mehr da sein',
      'nicht mehr aufwachen',
      'keinen sinn mehr zu leben',
      'ritze mich',
      'mich ritzen',
      'mir selbst weh tun',
      'mir selbst wehtun',
      'mir etwas antun',
      'mir was antun',
      'droht mich umzubringen',
      'angst um mein leben',
      'ich bin in gefahr',
    ],
    fr: [
      'suicid*',
      'je vais me tuer',
      'je veux me tuer',
      'envie de me tuer',
      'va me tuer',
      'veut me tuer',
      "envie d'en finir",
      'veux en finir',
      'en finir avec la vie',
      'mettre fin a mes jours',
      'mettre fin a ma vie',
      'me foutre en l air',
      "me foutre en l'air",
      'veux mourir',
      'envie de mourir',
      'plus envie de vivre',
      'veux disparaitre',
      'me faire du mal',
      'me scarifier',
      'menace de me tuer',
      'peur pour ma vie',
      'je suis en danger',
    ],
    es: [
      'suicid*',
      'quiero matarme',
      'voy a matarme',
      'me quiero matar',
      'me voy a matar',
      'ganas de matarme',
      'pienso en matarme',
      'quitarme la vida',
      'quiero morir',
      'quiero morirme',
      'no quiero vivir',
      'no quiero seguir viviendo',
      'ganas de morir',
      'quiero desaparecer',
      'quiero acabar con todo',
      'ganas de acabar con todo',
      'hacerme dano',
      'autolesion*',
      'me va a matar',
      'me quiere matar',
      'me ha amenazado de muerte',
      'amenaza con matarme',
      'miedo por mi vida',
      'estoy en peligro',
    ],
    it: [
      'suicid*',
      'uccidermi',
      'ammazzarmi',
      'mi voglio uccidere',
      'mi voglio ammazzare',
      'mi uccido',
      'mi ammazzo',
      'mi uccide',
      'mi ammazza',
      'togliermi la vita',
      'voglio morire',
      'non voglio piu vivere',
      'voglio farla finita',
      'pensando di farla finita',
      'farla finita con la vita',
      'voglio sparire',
      'farmi del male',
      'autolesion*',
      'mi vuole uccidere',
      'mi vuole ammazzare',
      'minaccia di uccidermi',
      'paura per la mia vita',
      'sono in pericolo',
    ],
  };

/**
 * Unambiguous everyday phrases removed before matching (normalised text): "Er bringt mich um 8
 * zum Bahnhof" (= brings me at 8). Keep this list short; when in doubt, show the card.
 */
const CRISIS_EXCEPTIONS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}])bringt? mich um (?=\d|halb |viertel |punkt |mitternacht)/gu,
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${Object.values(CRISIS_PHRASES)
    .flat()
    .map((entry) => {
      const prefix = entry.endsWith('*');
      const body = escape(normalize(prefix ? entry.slice(0, -1) : entry));
      return prefix ? body : `${body}(?![\\p{L}\\p{N}])`;
    })
    .join('|')})`,
  'u',
);

/** True when the text contains a crisis phrase in any of the five languages. */
export function looksLikeCrisis(text: string): boolean {
  let norm = normalize(text).replace(/[’`´]/g, "'");
  for (const exception of CRISIS_EXCEPTIONS) norm = norm.replace(exception, ' ');
  return PATTERN.test(norm);
}
