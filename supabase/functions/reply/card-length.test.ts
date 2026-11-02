// End-to-end (handler → pipeline → post-check → SSE) tests for the per-kind card length limit
// (schemas.ts cardMaxChars) and for the post-check following META.lang when the on-device hint
// was wrong. A scripted provider streams exact model output.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  emptyOutcome,
  type LlmPrompt,
  type LlmProvider,
  type ProviderStream,
} from '../_shared/llm/provider.ts';
import { cardMaxChars } from '../_shared/schemas.ts';
import { aiUser, cardTexts, readEvents, replyRequest, setupReply } from './testing.ts';

class ScriptedProvider implements LlmProvider {
  readonly name = 'fake' as const;
  readonly model = 'scripted';
  constructor(private readonly output: string) {}
  stream(_prompt: LlmPrompt): ProviderStream {
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

/** English filler of exactly n code points, so the language post-check sees English. */
function english(n: number): string {
  const base =
    'Thanks so much for the lovely weekend, the kids have not stopped talking about it. ';
  return base
    .repeat(Math.ceil(n / base.length))
    .slice(0, n)
    .trim()
    .padEnd(n, '.');
}

const META_EN = 'META|{"lang":"en","crisis":false,"refused":false}';

Deno.test('card length: a ~500-char polish card for a ~420-char draft is kept', async () => {
  const draft = english(420);
  const light = english(500);
  const rewrite = english(200);
  assert(cardMaxChars('polish', 420) >= 500);
  const { store, handler } = setupReply({
    providers: [new ScriptedProvider(`${META_EN}\nL|${light}\nW|${rewrite}\n`)],
  });
  const { token } = await aiUser(store);
  const events = await readEvents(
    await handler(replyRequest(token, { kind: 'polish', text: draft, langHint: 'en' })),
  );
  assertEquals(cardTexts(events), [light, rewrite]);
  assertEquals(events.at(-1)!.event, 'done');
});

Deno.test('card length: a polish card over 1.3× the draft is still dropped', async () => {
  const draft = english(420);
  const tooLong = english(cardMaxChars('polish', 420) + 1);
  const rewrite = english(200);
  const { store, handler } = setupReply({
    providers: [new ScriptedProvider(`${META_EN}\nL|${tooLong}\nW|${rewrite}\n`)],
  });
  const { token } = await aiUser(store);
  const events = await readEvents(
    await handler(replyRequest(token, { kind: 'polish', text: draft, langHint: 'en' })),
  );
  // One card short of 2 → the pipeline retries once; the scripted provider repeats itself.
  assertEquals(
    cardTexts(events).filter((t) => t === tooLong),
    [],
  );
  assert(cardTexts(events).includes(rewrite));
});

Deno.test(
  'card length: a reply card over 300 chars is dropped, even for a long message',
  async () => {
    const message = english(420);
    const long = english(301);
    const ok1 = 'That sounds lovely, how was the drive back?';
    const ok2 = 'Glad the kids enjoyed it, we should do it again soon.';
    const { store, handler } = setupReply({
      providers: [new ScriptedProvider(`${META_EN}\nR1|${long}\nR2|${ok1}\nR3|${ok2}\n`)],
    });
    const { token } = await aiUser(store);
    const events = await readEvents(
      await handler(replyRequest(token, { text: message, langHint: 'en' })),
    );
    assertEquals(cardTexts(events), [ok1, ok2]);
    assertEquals(cardMaxChars('reply', 420), 300);
  },
);

Deno.test(
  'wrong hint: META first in the message language → its cards survive the post-check',
  async () => {
    const cards = [
      'Klar, Freitag passt mir gut. Wann fängt das Konzert an?',
      'Wie cool, danke dass du an mich denkst! Ich bin dabei.',
      'Freitag klingt super, wollen wir vorher noch was essen?',
    ];
    const output = `META|{"lang":"de","crisis":false,"refused":false}\n${cards
      .map((c, i) => `R${i + 1}|${c}`)
      .join('\n')}\n`;
    const { store, handler } = setupReply({ providers: [new ScriptedProvider(output)] });
    const { token } = await aiUser(store);
    const events = await readEvents(
      await handler(
        replyRequest(token, {
          text: 'Hast du am Freitag Zeit? Ich hab zwei Karten fürs Konzert.',
          langHint: 'fr',
        }),
      ),
    );
    assertEquals(cardTexts(events), cards);
    assertEquals(events.find((e) => e.event === 'meta')!.data.lang, 'de');
  },
);
