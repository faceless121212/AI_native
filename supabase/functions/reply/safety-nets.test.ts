// End-to-end (handler → pipeline → post-check → SSE) tests for the deterministic nets added after
// the v4 live evals: emoji rule (spec §4), distinct openers, Spanish vs Italian, and the
// server-side refusal for a minor in a dating context (spec §9). Fake and scripted providers.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { FakeProvider } from '../_shared/llm/fake.ts';
import {
  emptyOutcome,
  type LlmPrompt,
  type LlmProvider,
  type ProviderStream,
} from '../_shared/llm/provider.ts';
import { captureConsole } from '../_shared/testing/helpers.ts';
import { aiUser, cardTexts, names, readEvents, replyRequest, setupReply } from './testing.ts';

class ScriptedProvider implements LlmProvider {
  readonly name = 'fake' as const;
  readonly model = 'scripted';
  calls = 0;
  constructor(private readonly output: string) {}
  stream(_prompt: LlmPrompt): ProviderStream {
    this.calls++;
    const outcome = emptyOutcome();
    const output = this.output;
    async function* run(): AsyncGenerator<string> {
      outcome.tokensIn = 100;
      for (let i = 0; i < output.length; i += 9) yield output.slice(i, i + 9);
      outcome.tokensOut = Math.ceil(output.length / 4);
      outcome.stop = 'end';
    }
    const iterable = run();
    return { outcome, [Symbol.asyncIterator]: () => iterable };
  }
}

const parsed = (lines: string[]) =>
  lines.flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, unknown>];
    } catch {
      return [];
    }
  });

// ---------------------------------------------------------------------------------------------
// Emoji

Deno.test(
  'nets: emoji under emoji=none arrive stripped, an emoji-only card is dropped, no retry',
  async () => {
    const fake = new FakeProvider({ script: ['emoji'] });
    const { store, handler } = setupReply({ providers: [fake] });
    const { token } = await aiUser(store);
    const { result: res, lines } = await captureConsole(() =>
      handler(replyRequest(token, { text: 'Hey, wie war dein Wochenende?' })),
    );
    const { result: events, lines: streamLines } = await captureConsole(() => readEvents(res));
    assertEquals(cardTexts(events), [
      'Klingt super! Wie war denn dein Wochenende?',
      'Haha, du weißt echt, wie man mich zum Lachen bringt. Kaffee diese Woche?',
    ]);
    assertEquals(fake.calls.length, 1, 'two cards survive: no retry');
    assertEquals(events.at(-1)!.event, 'done');
    const logged = parsed([...lines, ...streamLines]);
    assertEquals(
      logged.filter((l) => l.event === 'card_fixed'),
      [
        { fn: 'reply', event: 'card_fixed', reason: 'emoji' },
        { fn: 'reply', event: 'card_fixed', reason: 'emoji' },
      ],
    );
    assertEquals(
      logged.filter((l) => l.event === 'card_dropped').map((l) => l.reason),
      ['empty'],
    );
  },
);

Deno.test('nets: with an emoji in the message, each card keeps only its first emoji', async () => {
  const fake = new FakeProvider({ script: ['emoji'] });
  const { store, handler } = setupReply({ providers: [fake] });
  const { token } = await aiUser(store);
  const events = await readEvents(await handler(replyRequest(token, { text: 'Kino heute? 🎬' })));
  assertEquals(cardTexts(events), [
    'Klingt super! Wie war denn dein Wochenende? 😄',
    '😂',
    'Haha, du weißt echt, wie man mich zum Lachen bringt. Kaffee diese Woche? 😄',
  ]);
});

Deno.test("nets: Polish light edit keeps the draft's emoji, the rewrite keeps one", async () => {
  const fake = new FakeProvider({ script: ['emoji'] });
  const { store, handler } = setupReply({ providers: [fake] });
  const { token } = await aiUser(store);
  const events = await readEvents(
    await handler(
      replyRequest(token, {
        kind: 'polish',
        text: 'danke für deine nachricht 😄🎉',
        langHint: 'de',
      }),
    ),
  );
  // The fake's rewrite is emoji-only (😂😂) → one 😂; the light edit is left alone.
  assertEquals(cardTexts(events), [
    'Danke für deine Nachricht, ich melde mich morgen bei dir. 😄🎉',
    '😂',
  ]);
});

// ---------------------------------------------------------------------------------------------
// Distinct openers

Deno.test('nets: a reply card opening like an earlier one is dropped', async () => {
  const fake = new FakeProvider({ script: ['same-opener'] });
  const { store, handler } = setupReply({ providers: [fake] });
  const { token } = await aiUser(store);
  const { result: res, lines } = await captureConsole(() => handler(replyRequest(token)));
  const { result: events, lines: more } = await captureConsole(() => readEvents(res));
  assertEquals(cardTexts(events), [
    'Klingt super! Wie war denn dein Wochenende?',
    'Haha, du weißt echt, wie man mich zum Lachen bringt. Kaffee diese Woche?',
  ]);
  assertEquals(
    events.filter((e) => e.event === 'card').map((e) => e.data.index),
    [0, 1],
    'indexes stay contiguous',
  );
  assertEquals(fake.calls.length, 1, 'no retry with 2 cards (no 4th card requested yet)');
  assertEquals(
    parsed([...lines, ...more])
      .filter((l) => l.event === 'card_dropped')
      .map((l) => l.reason),
    ['same_opener'],
  );
  const row = store.requests.get(res.headers.get('x-request-id')!)!;
  assertEquals([row.status, row.finish!.safetyFlags], ['partial', ['card_dropped']]);
});

Deno.test(
  'nets: the opener rule does not apply to Polish (light and rewrite may share one)',
  async () => {
    const output = [
      'META|{"lang":"en","crisis":false,"refused":false}',
      'L|Thanks for your message, see you tomorrow.',
      'W|Thanks for your lovely message! See you tomorrow.',
      '',
    ].join('\n');
    const { store, handler } = setupReply({ providers: [new ScriptedProvider(output)] });
    const { token } = await aiUser(store);
    const events = await readEvents(
      await handler(
        replyRequest(token, { kind: 'polish', text: 'thx for ur msg', langHint: 'en' }),
      ),
    );
    assertEquals(cardTexts(events).length, 2);
  },
);

// ---------------------------------------------------------------------------------------------
// Spanish vs Italian

Deno.test(
  'nets: a Spanish card for lang it is dropped (live v3 failure), Italian ones kept',
  async () => {
    const output = [
      'META|{"lang":"it","crisis":false,"refused":false}',
      'R1|Me parece genial, tú trae el vino y yo llevo lo demás.',
      'R2|Ci sto! Porto io il dolce, così almeno siamo pari.',
      "R3|Perfetto, a stasera al solito posto. Non vedo l'ora di sentirti raccontare la giornata.",
      '',
    ].join('\n');
    const provider = new ScriptedProvider(output);
    const { store, handler } = setupReply({ providers: [provider] });
    const { token } = await aiUser(store);
    const { result: res } = await captureConsole(() =>
      handler(
        replyRequest(token, {
          text: 'Ci vediamo stasera al solito posto? Porto io il vino.',
          langHint: 'es', // wrong on-device hint; META says it
          relationship: 'partner',
        }),
      ),
    );
    const { result: events, lines } = await captureConsole(() => readEvents(res));
    assertEquals(cardTexts(events), [
      'Ci sto! Porto io il dolce, così almeno siamo pari.',
      "Perfetto, a stasera al solito posto. Non vedo l'ora di sentirti raccontare la giornata.",
    ]);
    assertEquals(provider.calls, 1);
    assertEquals(
      parsed(lines)
        .filter((l) => l.event === 'card_dropped')
        .map((l) => l.reason),
      ['wrong_lang'],
    );
  },
);

Deno.test('nets: swapped es/it cards from the fake are dropped and retried', async () => {
  for (const lang of ['it', 'es'] as const) {
    const fake = new FakeProvider({ script: ['es-it-swap', 'ok'] });
    const { store, handler } = setupReply({ providers: [fake] });
    const { token } = await aiUser(store);
    const { result: res } = await captureConsole(() =>
      handler(replyRequest(token, { text: 'Ciao / Hola', langHint: lang })),
    );
    const { result: events } = await captureConsole(() => readEvents(res));
    assertEquals(fake.calls.length, 2, `${lang}: fewer than 2 survived → one retry`);
    assertEquals(cardTexts(events).length, 3, lang);
  }
});

// ---------------------------------------------------------------------------------------------
// Minor in a dating context

const MINOR_EN = "haha I'm 15 so my mum says I can't date yet but we can chat 🙈";
const MINOR_DE = 'Bin erst in der 9. Klasse, aber meine Eltern müssen ja nichts wissen';
const MINOR_IT = 'ho 16 anni ahah';

/** Words of the age and school-year statements that must never reach a log line. */
const MINOR_WORDS = ['15', '16', '9.', 'klasse', 'anni', "i'm", 'mum', 'eltern'];

function leakedMinorWords(lines: string[]): string[] {
  const values = parsed(lines).flatMap((l) =>
    Object.values(l).filter((v): v is string => typeof v === 'string'),
  );
  const raw = lines.filter((l) => !l.startsWith('{'));
  return [...values, ...raw].filter((v) => MINOR_WORDS.some((w) => v.toLowerCase().includes(w)));
}

Deno.test(
  'nets: a minor in a match/partner reply is refused without calling the model',
  async () => {
    for (const [text, langHint, relationship] of [
      [MINOR_EN, 'en', 'match'],
      [MINOR_DE, 'de', 'match'], // school year
      [MINOR_IT, 'it', 'partner'],
      [MINOR_DE, 'de', 'partner'],
    ] as const) {
      const where = `${relationship}/${langHint}`;
      const fake = new FakeProvider();
      const { store, handler, analytics } = setupReply({ providers: [fake] });
      const { token } = await aiUser(store);
      const { result: res, lines } = await captureConsole(() =>
        handler(
          replyRequest(token, { text, langHint, relationship, tone: 'flirty', flirt: 'playful' }),
        ),
      );
      const { result: events, lines: more } = await captureConsole(() => readEvents(res));
      assertEquals(fake.calls.length, 0, `${where}: no LLM call`);
      // Same shape as a model refusal (handler.test.ts "model refusal (META refused)").
      assertEquals(names(events), ['meta', 'quota', 'done'], where);
      assertEquals(events[0]!.data, {
        requestId: res.headers.get('x-request-id'),
        lang: langHint,
        crisis: false,
        refused: true,
      });
      assertEquals(events[1]!.data.leftToday, 13, 'refunded: 10 starter + 3 daily');
      assertEquals(events[2]!.data.cards, 0);
      const row = store.requests.get(res.headers.get('x-request-id')!)!;
      assertEquals([row.status, row.finish!.safetyFlags], ['refused', ['refused']], where);
      assert(row.refundedAt !== null);
      assertEquals([row.finish!.provider, row.finish!.tokensIn], [null, 0]);
      assertEquals(row.finish!.lang, langHint, 'lang stored like a model refusal');
      // Cleared after the refund: the row can't say "this user's match is a minor".
      assertEquals(
        [row.input.relationship, row.input.tone, row.input.flirt],
        [null, null, null],
        where,
      );
      assertEquals([row.input.kind, row.charge], ['reply', 'starter'], 'charge info kept');
      assertEquals(analytics.anonymous, [{ name: 'safety_flag', props: { type: 'refused' } }]);
      const logged = parsed([...lines, ...more]);
      assertEquals(
        logged.filter((l) => l.event === 'refused_before_model'),
        [],
        'no separate event: the done line records the refusal',
      );
      assertEquals(logged.find((l) => l.event === 'done')!.status, 'refused');
      assertEquals(leakedMinorWords([...lines, ...more]), [], `${where}: no age or school words`);
    }
  },
);

Deno.test('nets: a model refusal keeps its chips (only server refusals are cleared)', async () => {
  const fake = new FakeProvider({ script: ['refused'] });
  const { store, handler } = setupReply({ providers: [fake] });
  const { token } = await aiUser(store);
  const res = await handler(replyRequest(token, { relationship: 'match', tone: 'funny' }));
  await readEvents(res);
  const row = store.requests.get(res.headers.get('x-request-id')!)!;
  assertEquals([row.status, row.input.relationship, row.input.tone], ['refused', 'match', 'funny']);
});

Deno.test(
  'nets: a stated minor outside dating gets no flirting (Flirty → Warm, flirt off)',
  async () => {
    for (const [text, relationship] of [
      [MINOR_EN, 'friend'],
      [MINOR_DE, 'friend'],
      [MINOR_EN, 'family'],
      [MINOR_IT, 'colleague'],
    ] as const) {
      const fake = new FakeProvider();
      const { store, handler } = setupReply({ providers: [fake] });
      const { token } = await aiUser(store);
      const { result: res, lines } = await captureConsole(() =>
        handler(
          replyRequest(token, {
            text,
            langHint: 'en',
            relationship,
            tone: 'flirty',
            flirt: 'light',
          }),
        ),
      );
      const { result: events, lines: more } = await captureConsole(() => readEvents(res));
      assertEquals(fake.calls.length, 1, relationship);
      assert(fake.calls[0]!.user.includes('tone=warm'), relationship);
      assert(fake.calls[0]!.user.includes('flirt=off'), relationship);
      assert(cardTexts(events).length >= 2, relationship);
      const row = store.requests.get(res.headers.get('x-request-id')!)!;
      assertEquals([row.input.tone, row.input.flirt], ['warm', 'off'], relationship);
      assert(row.finish!.safetyFlags.includes('flirt_forced_off'), relationship);
      assertEquals(leakedMinorWords([...lines, ...more]), [], relationship);
    }
    // Without a stated age a friend may still get Flirty (chips.ts unchanged).
    const fake = new FakeProvider();
    const { store, handler } = setupReply({ providers: [fake] });
    const { token } = await aiUser(store);
    await readEvents(
      await handler(replyRequest(token, { relationship: 'friend', tone: 'flirty', flirt: 'off' })),
    );
    assert(fake.calls[0]!.user.includes('tone=flirty'));
  },
);

Deno.test('nets: Polish with a stated age goes to the model unchanged', async () => {
  const fake = new FakeProvider();
  const { store, handler } = setupReply({ providers: [fake] });
  const { token } = await aiUser(store);
  const events = await readEvents(
    await handler(
      replyRequest(token, {
        kind: 'polish',
        text: MINOR_EN,
        langHint: 'en',
        relationship: 'match',
        tone: 'flirty',
        flirt: 'light',
      }),
    ),
  );
  assertEquals(fake.calls.length, 1);
  assert(fake.calls[0]!.user.includes('tone=flirty'));
  assert(cardTexts(events).length >= 2);
});

Deno.test(
  "nets: someone else's age, a duration or the past in a match reply is not refused",
  async () => {
    for (const text of [
      'my son is 15 and loves football, do you have kids?',
      'My daughter, 16 years old, is at school today',
      "I'm 15 minutes away!",
      'I was 16 when I first went to Paris',
      'Drinks are 15€ there, fine?',
      "I'm in year 9 of my PhD, so busy",
    ]) {
      const fake = new FakeProvider();
      const { store, handler } = setupReply({ providers: [fake] });
      const { token } = await aiUser(store);
      const res = await handler(
        replyRequest(token, { text, langHint: 'en', relationship: 'match', tone: 'flirty' }),
      );
      const events = await readEvents(res);
      assertEquals(fake.calls.length, 1, text);
      assertEquals(events.at(-1)!.event, 'done', text);
      const row = store.requests.get(res.headers.get('x-request-id')!)!;
      assertEquals(row.input.tone, 'flirty', `${text}: chips untouched`);
    }
  },
);

Deno.test(
  'nets: a crisis message from a minor match goes to the model (rule 7), no flirting',
  async () => {
    const fake = new FakeProvider({ script: ['crisis'] });
    const { store, handler } = setupReply({ providers: [fake] });
    const { token } = await aiUser(store);
    const res = await handler(
      replyRequest(token, {
        text: "I'm 15 and I want to kill myself",
        langHint: 'en',
        relationship: 'match',
        tone: 'flirty',
        flirt: 'playful',
      }),
    );
    const events = await readEvents(res);
    assertEquals(fake.calls.length, 1, 'supportive replies from the model');
    assert(fake.calls[0]!.user.includes('tone=warm'));
    assert(fake.calls[0]!.user.includes('flirt=off'));
    const meta = events.find((e) => e.event === 'meta')!;
    assertEquals([meta.data.crisis, meta.data.refused], [true, false]);
    assertEquals(cardTexts(events).length, 3);
    const row = store.requests.get(res.headers.get('x-request-id')!)!;
    assert(row.finish!.safetyFlags.includes('flirt_forced_off'));
  },
);
// ---------------------------------------------------------------------------------------------
// Regression (live run, it-wrong-hint-es → `error internal`): the on-device hint said es, the
// message and the cards were Italian, and META was late, missing or also wrong. Cards in the
// message's own language are never dropped as wrong_lang.

const IT_MESSAGE = 'Ci vediamo stasera al solito posto? Porto io il vino.';

Deno.test(
  'regression: META last, wrong hint: Italian cards for an Italian message are kept, no retry',
  async () => {
    const fake = new FakeProvider({ script: ['lang-it-metalast', 'lang-it-metalast'] });
    const { store, handler } = setupReply({ providers: [fake] });
    const { token } = await aiUser(store);
    const { result: res } = await captureConsole(() =>
      handler(replyRequest(token, { text: IT_MESSAGE, langHint: 'es', relationship: 'partner' })),
    );
    const { result: events, lines } = await captureConsole(() => readEvents(res));
    assertEquals(cardTexts(events).length, 3);
    assertEquals(fake.calls.length, 1, 'no retry');
    assertEquals(
      parsed(lines).filter((l) => l.event === 'card_dropped'),
      [],
    );
  },
);

Deno.test(
  'regression: META wrong or missing, wrong hint: Italian cards still arrive (was error internal)',
  async () => {
    const cards = [
      "R1|Che bello! Com'è andato il tuo fine settimana?",
      'R2|Mi fa piacere che mi scrivi, stavo pensando a te anche io.',
      'R3|Certo, il vino lo porti tu e io preparo la cena. Non vedo l’ora!',
    ];
    for (const meta of ['META|{"lang":"es","crisis":false,"refused":false}', null]) {
      const output = [...(meta ? [meta] : []), ...cards, ''].join('\n');
      const provider = new ScriptedProvider(output);
      const { store, handler } = setupReply({ providers: [provider] });
      const { token } = await aiUser(store);
      const { result: res } = await captureConsole(() =>
        handler(replyRequest(token, { text: IT_MESSAGE, langHint: 'es', relationship: 'partner' })),
      );
      const { result: events } = await captureConsole(() => readEvents(res));
      assertEquals(events.at(-1)!.event, 'done', String(meta));
      assertEquals(cardTexts(events).length, 3, String(meta));
    }
  },
);

Deno.test(
  'regression: the message-language rule only keeps cards, it never drops more',
  async () => {
    const output = [
      'R1|Me parece genial, tú trae el vino y yo llevo lo demás.',
      "R2|Che bello! Com'è andato il tuo fine settimana?",
      'R3|Mi fa piacere che mi scrivi, stavo pensando a te anche io.',
      'META|{"lang":"it","crisis":false,"refused":false}',
      '',
    ].join('\n');
    const { store, handler } = setupReply({ providers: [new ScriptedProvider(output)] });
    const { token } = await aiUser(store);
    const { result: res } = await captureConsole(() =>
      handler(replyRequest(token, { text: IT_MESSAGE, langHint: 'es', relationship: 'partner' })),
    );
    const { result: events } = await captureConsole(() => readEvents(res));
    // R1 arrives before META, so it is checked against the hint (es) and fits it: delivered. The
    // message language (it) is only an extra language a card may be in, never a reason to drop.
    assertEquals(cardTexts(events).length, 3);
  },
);
