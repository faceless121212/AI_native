// Server-sent events: formatting our `reply` stream, and a small reader for SSE bodies (Mistral's
// stream, tests and scripts/try-reply.ts). Plain TypeScript, no Deno globals, so Node scripts can
// import it. The reader handles events split across chunks and CRLF line endings.

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface SseMessage {
  event: string | null;
  data: string;
}

/** Yields one message per blank-line-terminated SSE block. Comment lines (":") are skipped. */
export async function* readSse(
  body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];

  function* drain(final: boolean): Generator<SseMessage> {
    for (;;) {
      const nl = buffer.search(/\r\n|\n|\r/);
      if (nl === -1) {
        if (!final || buffer.length === 0) return;
        // A last line without its newline: treat as complete at end of stream.
        buffer += '\n';
        continue;
      }
      // A lone "\r" at the very end might be the first half of "\r\n": wait for more.
      if (!final && buffer[nl] === '\r' && nl === buffer.length - 1) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + (buffer.startsWith('\r\n', nl) ? 2 : 1));
      if (line === '') {
        if (data.length > 0 || event !== null) yield { event, data: data.join('\n') };
        event = null;
        data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
  }

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    yield* drain(false);
  }
  buffer += decoder.decode();
  yield* drain(true);
  if (data.length > 0) yield { event, data: data.join('\n') };
}
