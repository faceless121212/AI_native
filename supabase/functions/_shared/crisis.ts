// Crisis backstop (spec §9; privacy review): a deterministic check of the (redacted) input for
// phrases that suggest self-harm, suicide or immediate danger, in all five languages. The model's
// META.crisis is the primary signal; this only fills the gap when META is missing, the provider
// refused, or the stream ended early, so the client still shows the crisis card.
//
// The result is a boolean used for the SSE `meta` event only: it is never stored, logged or sent
// to analytics. Lists are a first draft for prompt-engineer to review in Prompt 4; they favour
// recall on clear phrases over catching every wording. Matching: lowercase, accents stripped,
// word boundaries; a trailing "*" matches a word prefix.
import { normalize } from './postcheck.ts';

export const CRISIS_PHRASES: Readonly<Record<'en' | 'de' | 'fr' | 'es' | 'it', readonly string[]>> =
  {
    en: [
      'suicide',
      'suicidal',
      'kill myself',
      'killing myself',
      'end my life',
      'take my own life',
      'want to die',
      'wanna die',
      "don't want to live",
      'dont want to live',
      'no reason to live',
      'better off dead',
      'self harm',
      'self-harm',
      'hurt myself',
      'cut myself',
      'overdose',
      'going to kill me',
      'gonna kill me',
      'threatening to kill',
    ],
    de: [
      'suizid*',
      'selbstmord*',
      'mich umbringen',
      'mich umzubringen',
      'mir das leben nehmen',
      'mir das leben zu nehmen',
      'will sterben',
      'sterben will',
      'nicht mehr leben',
      'nicht mehr da sein',
      'ritze mich',
      'mich ritzen',
      'mir weh tun',
      'mir etwas antun',
      'bringt mich um',
      'will mich umbringen',
    ],
    fr: [
      'suicide',
      'me suicider',
      'suicidaire',
      'me tuer',
      'en finir',
      'mettre fin a mes jours',
      'veux mourir',
      'envie de mourir',
      'plus envie de vivre',
      'me faire du mal',
      'me scarifier',
      'va me tuer',
      'veut me tuer',
    ],
    es: [
      'suicidio',
      'suicidarme',
      'suicida',
      'matarme',
      'quitarme la vida',
      'quiero morir',
      'quiero morirme',
      'no quiero vivir',
      'ganas de morir',
      'hacerme dano',
      'autolesion*',
      'me va a matar',
      'me quiere matar',
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
      'farla finita',
      'farmi del male',
      'autolesion*',
      'mi uccide',
      'mi vuole uccidere',
      'mi ammazza',
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
