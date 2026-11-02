// Crisis backstop (spec §9; privacy review): a deterministic check of the (redacted) input for
// phrases that suggest self-harm, suicide or immediate danger, in all five languages. The model's
// META.crisis is the primary signal; this only fills the gap when META is missing, the provider
// refused, or the stream ended early, so the client still shows the crisis card.
//
// The result is a boolean used for the SSE `meta` event only: it is never stored, logged or sent
// to analytics. Lists reviewed by prompt-engineer in Prompt 4; they favour recall on clear
// phrases over catching every wording, without everyday idioms. Matching: lowercase, accents stripped,
// word boundaries; a trailing "*" matches a word prefix.
import { normalize } from './postcheck.ts';

export const CRISIS_PHRASES: Readonly<Record<'en' | 'de' | 'fr' | 'es' | 'it', readonly string[]>> =
  {
    // Reviewed by prompt-engineer (Prompt 4). Removed idioms that misfire in everyday texting
    // ("my mum is going to kill me", "ça va me tuer", "questo caldo mi uccide", "er bringt mich
    // um 8 zum Bahnhof", "nicht mehr da sein", "cortarme el pelo", "acabar con todo el trabajo"):
    // danger phrases need a he/she subject or a first-person intent. Added slang and danger phrases. Verify with native
    // speakers before launch (docs: native review pack).
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
      'want to hurt myself',
      'going to hurt myself',
      'cutting myself',
      'cut myself again',
      'overdose',
      'he is going to kill me',
      "he's going to kill me",
      'she is going to kill me',
      "she's going to kill me",
      "they're going to kill me",
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
      'mich umzubringen',
      'mich selbst umbringen',
      'mich umbringen will',
      'werde mich umbringen',
      'mir das leben nehmen',
      'mir das leben zu nehmen',
      'will sterben',
      'sterben will',
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
      'will mich umbringen',
      'droht mich umzubringen',
      'angst um mein leben',
      'ich bin in gefahr',
    ],
    fr: [
      'suicide',
      'me suicider',
      'suicidaire',
      'je vais me tuer',
      'je veux me tuer',
      'envie de me tuer',
      "envie d'en finir",
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
      'il va me tuer',
      'elle va me tuer',
      'veut me tuer',
      'menace de me tuer',
      'peur pour ma vie',
      'je suis en danger',
    ],
    es: [
      'suicidio',
      'suicidarme',
      'suicida',
      'quiero matarme',
      'voy a matarme',
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
      'me quiere matar',
      'me ha amenazado de muerte',
      'amenaza con matarme',
      'miedo por mi vida',
      'estoy en peligro',
    ],
    it: [
      'suicidio',
      'suicidarmi',
      'suicida',
      'uccidermi',
      'ammazzarmi',
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
  return PATTERN.test(normalize(text).replace(/[’`´]/g, "'"));
}
