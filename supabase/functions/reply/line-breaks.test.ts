// End-to-end (fake provider → parser → post-check → SSE) tests for line breaks: Polish cards keep
// the draft's paragraph and line breaks (the model writes them as `\n`, llm/lines.ts unescapes);
// reply cards never contain a newline.
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { FakeProvider } from '../_shared/llm/fake.ts';
import { LANGS } from '../_shared/schemas.ts';
import { aiUser, cardTexts, readEvents, replyRequest, setupReply } from './testing.ts';

const DRAFT = 'hi sam,\n\nthanks for ur message ill get back to u tomorrow\n\nsee u soon, alex';

for (const chunkSize of [1, 7]) {
  Deno.test(
    `line breaks: polish cards keep three paragraphs (chunks of ${chunkSize})`,
    async () => {
      for (const lang of LANGS) {
        for (const formality of ['casual', 'formal'] as const) {
          const where = `${lang}/${formality}`;
          const { store, handler } = setupReply({
            providers: [new FakeProvider({ script: ['multiline'], chunkSize })],
          });
          const { token } = await aiUser(store);
          const events = await readEvents(
            await handler(
              replyRequest(token, { kind: 'polish', text: DRAFT, langHint: lang, formality }),
            ),
          );
          const [light, rewrite] = cardTexts(events);
          assertEquals(events.at(-1)!.event, 'done', where);
          for (const card of [light!, rewrite!]) {
            assertEquals(card.split('\n\n').length, 3, where);
            assertFalse(card.includes('\\n'), `no escape left: ${where}`);
          }
          if (formality === 'casual') {
            assert(
              rewrite!.includes('¯\\_(ツ)_/¯'),
              `escaped backslash comes back as one: ${where}`,
            );
          }
        }
      }
    },
  );
}

Deno.test('line breaks: reply cards are flattened to one line', async () => {
  for (const lang of LANGS) {
    const { store, handler } = setupReply({
      providers: [new FakeProvider({ script: ['multiline'], chunkSize: 3 })],
    });
    const { token } = await aiUser(store);
    const events = await readEvents(
      await handler(replyRequest(token, { text: DRAFT, langHint: lang })),
    );
    const cards = cardTexts(events);
    assertEquals(cards.length, 3, lang);
    for (const card of cards) {
      assertFalse(card.includes('\n'), lang);
      assertFalse(card.includes('\\n'), lang);
    }
  }
});
