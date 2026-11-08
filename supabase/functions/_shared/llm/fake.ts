// Deterministic fake provider (LLM_MODE=fake: local and CI). Answers in the requested language
// and formality using the real output format (R1|…, L|…/W|…, META|{…}), streamed in small chunks
// that split lines, so the parser's chunk handling is exercised on every run.
//
// Scenarios simulate every pipeline path. Choose one per call either with `script` (tests) or by
// putting a marker in the message text, e.g. "[[fake:slow]]" (scripts/try-reply.ts, evals):
//   ok · error · error-after-card · slow · refusal · refused · crisis · malformed · explicit ·
//   wronglang · long · truncated · metafirst (v1 prompt order: META line first) · crisis-nometa
//   (supportive crisis lines but the META line is lost: exercises the crisis keyword backstop) ·
//   lang-en|de|fr|es|it (META first and cards in that language whatever the hint said: the
//   on-device hint was wrong and the model followed the message) · lang-fr-group (like lang-fr,
//   but the cards speak casually to a group: plural "vous" that is not formal) · multiline (META first; Polish
//   cards keep a three-paragraph draft's breaks, written as `\n` the way the polish prompt asks,
//   the casual rewrite with an escaped backslash `\\`; reply cards contain a stray `\n` the parser
//   flattens to a space)
import type { Lang, ReplyKind } from '../schemas.ts';
import {
  emptyOutcome,
  type LlmPrompt,
  type LlmProvider,
  ProviderError,
  type ProviderName,
  type ProviderStream,
  type StreamOptions,
} from './provider.ts';

export const FAKE_SCENARIOS = [
  'ok',
  'error',
  'error-after-card',
  'slow',
  'refusal',
  'refused',
  'crisis',
  'malformed',
  'explicit',
  'wronglang',
  'long',
  'truncated',
  'metafirst',
  'crisis-nometa',
  'lang-en',
  'lang-de',
  'lang-fr',
  'lang-es',
  'lang-it',
  'lang-fr-group',
  'multiline',
] as const;
export type FakeScenario = (typeof FAKE_SCENARIOS)[number];

type Formality = 'casual' | 'formal';
type Lines = readonly [string, string, string];

const REPLIES: Record<Lang, Record<Formality, Lines>> = {
  en: {
    casual: [
      'That sounds lovely! How was the rest of your weekend?',
      "I'm glad you told me, I was thinking about you too.",
      'Ha, you always know how to make me smile. Coffee this week?',
    ],
    formal: [
      'Thank you for your message, that sounds very good.',
      'I appreciate you letting me know. Shall we talk this week?',
      'That is good to hear. I will get back to you soon.',
    ],
  },
  de: {
    casual: [
      'Klingt super! Wie war denn dein Wochenende?',
      'Schön, dass du dich meldest, ich habe auch an dich gedacht.',
      'Haha, du weißt echt, wie man mich zum Lachen bringt. Kaffee diese Woche?',
    ],
    formal: [
      'Vielen Dank für Ihre Nachricht, das klingt sehr gut.',
      'Schön, dass Sie sich melden. Passt es Ihnen diese Woche?',
      'Das freut mich zu hören. Ich melde mich bald bei Ihnen.',
    ],
  },
  fr: {
    casual: [
      "Ça a l'air génial ! Et toi, ton week-end s'est bien passé ?",
      "Ça me fait plaisir que tu m'écrives, je pensais à toi aussi.",
      'Haha, tu sais toujours comment me faire rire. Un café cette semaine ?',
    ],
    formal: [
      'Merci pour votre message, cela me semble très bien.',
      'Je vous remercie de me prévenir. Seriez-vous disponible cette semaine ?',
      'Je suis ravi de le savoir. Je reviens vers vous très vite.',
    ],
  },
  es: {
    casual: [
      '¡Suena genial! ¿Qué tal te fue el fin de semana?',
      'Me alegra que me escribas, yo también estaba pensando en ti.',
      'Jaja, siempre sabes cómo hacerme reír. ¿Un café esta semana?',
    ],
    formal: [
      'Muchas gracias por su mensaje, me parece muy bien.',
      'Le agradezco que me avise. ¿Le viene bien esta semana?',
      'Me alegra saberlo. Le escribo pronto.',
    ],
  },
  it: {
    casual: [
      "Che bello! Com'è andato il tuo fine settimana?",
      'Mi fa piacere che mi scrivi, stavo pensando a te anche io.',
      'Ahah, sai sempre come farmi ridere. Un caffè questa settimana?',
    ],
    formal: [
      'La ringrazio per il suo messaggio, mi sembra molto bene.',
      'Grazie per avermi avvisato. Le andrebbe bene questa settimana?',
      'Mi fa piacere saperlo. Le scrivo presto.',
    ],
  },
};

const POLISH: Record<Lang, Record<Formality, readonly [string, string]>> = {
  en: {
    casual: [
      "Thanks for your message, I'll get back to you tomorrow.",
      "Thanks so much for writing! I'll reply properly tomorrow.",
    ],
    formal: [
      'Thank you for your message. I will get back to you tomorrow.',
      'Many thanks for your message. I will reply in full tomorrow.',
    ],
  },
  de: {
    casual: [
      'Danke für deine Nachricht, ich melde mich morgen bei dir.',
      'Danke dir für die Nachricht! Ich antworte dir morgen in Ruhe.',
    ],
    formal: [
      'Vielen Dank für Ihre Nachricht, ich melde mich morgen bei Ihnen.',
      'Herzlichen Dank für Ihre Nachricht. Ich antworte Ihnen morgen ausführlich.',
    ],
  },
  fr: {
    casual: [
      'Merci pour ton message, je te réponds demain.',
      'Merci beaucoup pour ton message ! Je te réponds tranquillement demain.',
    ],
    formal: [
      'Merci pour votre message, je vous réponds demain.',
      'Je vous remercie pour votre message. Je vous répondrai en détail demain.',
    ],
  },
  es: {
    casual: [
      'Gracias por tu mensaje, te contesto mañana.',
      '¡Muchas gracias por escribirme! Mañana te contesto con calma.',
    ],
    formal: [
      'Gracias por su mensaje, le contesto mañana.',
      'Muchas gracias por su mensaje. Mañana le respondo con detalle.',
    ],
  },
  it: {
    casual: [
      'Grazie per il tuo messaggio, ti rispondo domani.',
      'Grazie mille per il messaggio! Domani ti rispondo con calma.',
    ],
    formal: [
      'Grazie per il suo messaggio, le rispondo domani.',
      'La ringrazio molto per il messaggio. Domani le rispondo con calma.',
    ],
  },
};

const CRISIS: Record<Lang, Lines> = {
  en: [
    "I'm really glad you told me. I'm here for you, can I call you now?",
    'That sounds so heavy. You are not alone in this, I am with you.',
    'Thank you for telling me. Please stay with me, I care about you a lot.',
  ],
  de: [
    'Ich bin froh, dass du es mir sagst. Ich bin für dich da, kann ich dich anrufen?',
    'Das klingt so schwer. Du bist damit nicht allein, ich bin bei dir.',
    'Danke, dass du es mir erzählst. Du bist mir sehr wichtig.',
  ],
  fr: [
    "Je suis content que tu me le dises. Je suis là pour toi, je peux t'appeler ?",
    "Ça a l'air tellement lourd. Tu n'es pas seul, je suis avec toi.",
    'Merci de me le dire. Tu comptes beaucoup pour moi.',
  ],
  es: [
    'Me alegra que me lo cuentes. Estoy aquí para ti, ¿te puedo llamar?',
    'Suena muy duro. No estás solo en esto, estoy contigo.',
    'Gracias por contármelo. Me importas mucho.',
  ],
  it: [
    'Sono contento che me lo dici. Sono qui per te, posso chiamarti?',
    'Sembra davvero pesante. Non sei solo, sono con te.',
    'Grazie per avermelo detto. Ci tengo tanto a te.',
  ],
};

/** Greeting and sign-off around the Polish body for 'multiline' (three paragraphs; formal sign-offs put the name on its own line). */
const MULTILINE: Record<Lang, Record<Formality, readonly [string, string]>> = {
  en: {
    casual: ['Hi Sam,', 'See you soon, Alex'],
    formal: ['Dear Ms Taylor,', 'Kind regards,\nAlex Morgan'],
  },
  de: {
    casual: ['Hallo Sam,', 'Bis bald, Alex'],
    formal: ['Sehr geehrte Frau Weber,', 'Mit freundlichen Grüßen\nAlex Morgan'],
  },
  fr: {
    casual: ['Salut Sam,', 'À bientôt, Alex'],
    formal: ['Madame Martin,', 'Bien cordialement,\nAlex Morgan'],
  },
  es: {
    casual: ['Hola, Sam:', 'Hasta pronto, Alex'],
    formal: ['Estimada señora García:', 'Un cordial saludo,\nAlex Morgan'],
  },
  it: {
    casual: ['Ciao Sam,', 'A presto, Alex'],
    formal: ['Gentile signora Rossi,', 'Cordiali saluti,\nAlex Morgan'],
  },
};

/** Escapes a card for one output line the way the polish prompt asks (`\\` first, then `\n`). */
export function escapeCardLine(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n');
}

const OTHER_LANG: Record<Lang, Lang> = { en: 'de', de: 'fr', fr: 'es', es: 'it', it: 'en' };

const MARKER = /\[\[fake:([a-z-]+)\]\]/;

export function scenarioFromText(text: string): FakeScenario {
  const match = MARKER.exec(text);
  const name = match?.[1];
  return (FAKE_SCENARIOS as readonly string[]).includes(name ?? '') ? (name as FakeScenario) : 'ok';
}

function meta(lang: Lang, crisis = false, refused = false): string {
  return `META|${JSON.stringify({ lang, crisis, refused })}`;
}

function cardLines(kind: ReplyKind, lang: Lang, formality: Formality): string[] {
  if (kind === 'polish') {
    const [light, rewrite] = POLISH[lang][formality];
    return [`L|${light}`, `W|${rewrite}`];
  }
  return REPLIES[lang][formality].map((text, i) => `R${i + 1}|${text}`);
}

/** Full model output for a scenario (before chunking). */
export function fakeOutput(scenario: FakeScenario, prompt: LlmPrompt): string {
  const { kind, lang, formality } = prompt;
  const cards = cardLines(kind, lang, formality);
  switch (scenario) {
    case 'refused':
      return `${meta(lang, false, true)}\n`;
    case 'crisis': {
      const lines =
        kind === 'polish'
          ? [`L|${CRISIS[lang][0]}`, `W|${CRISIS[lang][1]}`]
          : CRISIS[lang].map((t, i) => `R${i + 1}|${t}`);
      return `${lines.join('\n')}\n${meta(lang, true)}\n`;
    }
    case 'malformed':
      return [
        'Sure! Here are some replies:',
        '1. **not a tagged line**',
        cards[0],
        'R9|unknown tag',
        'META|{not json',
        '',
      ].join('\n');
    case 'explicit':
      // All but the first card hit the explicit-terms list (post-check drops them).
      return `${cards.map((c, i) => (i === 0 ? c : `${c.slice(0, 2)}|xxx-explicit-term`)).join('\n')}\n${meta(lang)}\n`;
    case 'wronglang': {
      const other = OTHER_LANG[lang];
      return `${cardLines(kind, other, formality).join('\n')}\n${meta(lang)}\n`;
    }
    case 'long':
      return `${cards.map((c, i) => (i === 0 ? `${c} ${'la '.repeat(120)}` : c)).join('\n')}\n${meta(lang)}\n`;
    case 'truncated':
      return `${cards[0]}\n${(cards[1] ?? '').slice(0, 12)}`;
    case 'metafirst':
      return `${meta(lang)}\n${cards.join('\n')}\n`;
    case 'lang-en':
    case 'lang-de':
    case 'lang-fr':
    case 'lang-es':
    case 'lang-it': {
      const actual = scenario.slice(5) as Lang;
      return `${meta(actual)}\n${cardLines(kind, actual, formality).join('\n')}\n`;
    }
    case 'lang-fr-group': {
      const lines =
        kind === 'polish'
          ? [
              'L|Désolé, je serai en retard de 10 min, commencez sans moi.',
              "W|J'arrive dans 10 min, commencez sans moi, je vous rejoins !",
            ]
          : [
              'R1|Trop bien, vous êtes déjà là ?',
              "R2|J'arrive dans 10 min, gardez-moi une place.",
              'R3|Commencez sans moi, je vous rejoins vite !',
            ];
      return `${meta('fr')}\n${lines.join('\n')}\n`;
    }
    case 'multiline': {
      if (kind === 'polish') {
        const [hello, bye] = MULTILINE[lang][formality];
        const [light, rewrite] = POLISH[lang][formality];
        return [
          meta(lang),
          `L|${escapeCardLine(`${hello}\n\n${light}\n\n${bye}`)}`,
          // The rewrite keeps the breaks too; casual adds a backslash (an emoticon), sent as \\.
          `W|${escapeCardLine(`${hello}\n\n${rewrite}${formality === 'casual' ? ' ¯\\_(ツ)_/¯' : ''}\n\n${bye}`)}`,
          '',
        ].join('\n');
      }
      const [first, ...others] = REPLIES[lang][formality];
      const split = first.replace(/([!?.,]) /, '$1\\n');
      return [meta(lang), `R1|${split}`, ...others.map((t, i) => `R${i + 2}|${t}`), ''].join('\n');
    }
    case 'crisis-nometa':
      return `${(kind === 'polish'
        ? [`L|${CRISIS[lang][0]}`, `W|${CRISIS[lang][1]}`]
        : CRISIS[lang].map((t, i) => `R${i + 1}|${t}`)
      ).join('\n')}\n`;
    default:
      return `${cards.join('\n')}\n${meta(lang)}\n`;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export interface FakeProviderOptions {
  /** Scenario per call (call 1 = script[0], …); after the script, markers / 'ok'. */
  script?: FakeScenario[];
  chunkSize?: number;
  /** Delay before the first chunk in the 'slow' scenario. */
  slowMs?: number;
  /** Delay between chunks (0 = none). */
  chunkDelayMs?: number;
  name?: ProviderName;
  model?: string;
}

export class FakeProvider implements LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Prompts received, for tests (in memory only). */
  readonly calls: LlmPrompt[] = [];
  /** Set when a stream was aborted by the caller. */
  aborts = 0;
  private readonly opts: Required<Omit<FakeProviderOptions, 'name' | 'model' | 'script'>> & {
    script: FakeScenario[];
  };

  constructor(opts: FakeProviderOptions = {}) {
    this.name = opts.name ?? 'fake';
    this.model = opts.model ?? 'fake-v1';
    this.opts = {
      script: [...(opts.script ?? [])],
      chunkSize: opts.chunkSize ?? 7,
      slowMs: opts.slowMs ?? 3000,
      chunkDelayMs: opts.chunkDelayMs ?? 0,
    };
  }

  stream(prompt: LlmPrompt, opts: StreamOptions): ProviderStream {
    const callIndex = this.calls.length;
    this.calls.push(prompt);
    const scenario = this.opts.script[callIndex] ?? scenarioFromText(prompt.user);
    const outcome = emptyOutcome();
    const settings = this.opts;
    const name = this.name;
    // deno-lint-ignore no-this-alias
    const self = this;

    async function* run(): AsyncGenerator<string> {
      outcome.tokensIn = Math.ceil((prompt.system.length + prompt.user.length) / 4);
      try {
        if (scenario === 'error') throw new ProviderError(name, 'server', 500);
        if (scenario === 'slow') await sleep(settings.slowMs, opts.signal);
        const output = fakeOutput(scenario, prompt);
        const firstLineEnd = output.indexOf('\n') + 1;
        for (let i = 0; i < output.length; i += settings.chunkSize) {
          if (opts.signal.aborted) throw new DOMException('aborted', 'AbortError');
          if (scenario === 'error-after-card' && i >= firstLineEnd) {
            throw new ProviderError(name, 'server', 500);
          }
          if (scenario === 'refusal' && i >= firstLineEnd) break;
          const chunk = output.slice(i, i + settings.chunkSize);
          outcome.tokensOut += Math.ceil(chunk.length / 4);
          yield chunk;
          if (settings.chunkDelayMs > 0) await sleep(settings.chunkDelayMs, opts.signal);
        }
        outcome.stop =
          scenario === 'refusal' ? 'refusal' : scenario === 'truncated' ? 'max_tokens' : 'end';
        if (scenario === 'refusal') outcome.refusalCategory = 'general_harms';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          self.aborts++;
          throw new ProviderError(name, 'aborted');
        }
        throw err;
      }
    }

    const iterable = run();
    return { outcome, [Symbol.asyncIterator]: () => iterable };
  }
}
