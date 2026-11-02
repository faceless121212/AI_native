import { assertEquals } from 'jsr:@std/assert@1';
import { formatSse, readSse } from './sse.ts';

async function collect(chunks: string[]) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
  const out = [];
  for await (const m of readSse(body)) out.push(m);
  return out;
}

Deno.test(
  'sse: reads events split anywhere, CRLF, comments, multi-line data, no final blank line',
  async () => {
    const text =
      formatSse('card', { index: 0, text: 'Schön 😊' }) +
      ': keep-alive\r\n\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\ndata: [DONE]';
    const expected = [
      { event: 'card', data: '{"index":0,"text":"Schön 😊"}' },
      { event: 'x', data: 'a\nb' },
      { event: null, data: '[DONE]' },
    ];
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i <= bytes.length; i++) {
      const dec = new TextDecoder();
      const parts = [dec.decode(bytes.slice(0, i)), new TextDecoder().decode(bytes.slice(i))];
      // Split on bytes (inside the emoji too): feed raw bytes.
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes.slice(0, i));
          c.enqueue(bytes.slice(i));
          c.close();
        },
      });
      const out = [];
      for await (const m of readSse(body)) out.push(m);
      assertEquals(out, expected, `split at byte ${i} (${parts[0]?.length})`);
    }
    assertEquals(await collect([text]), expected);
  },
);
