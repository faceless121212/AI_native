// Canned Bedrock InvokeModelWithResponseStream responses: AWS binary event-stream frames
// ({"bytes": base64(<Claude stream event>)}), encoded with the codec the AWS SDKs use.
import { EventStreamCodec } from 'npm:@smithy/eventstream-codec@2.2.0';

const codec = new EventStreamCodec(
  (bytes: Uint8Array) => new TextDecoder().decode(bytes),
  (text: string) => new TextEncoder().encode(text),
);

function frame(event: Record<string, unknown>): Uint8Array {
  const bytes = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(event))));
  return codec.encode({
    headers: {
      ':event-type': { type: 'string', value: 'chunk' },
      ':message-type': { type: 'string', value: 'event' },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: new TextEncoder().encode(JSON.stringify({ bytes })),
  });
}

export function eventStream(events: Array<Record<string, unknown>>, splitEvery = 0): Response {
  const all = events.map(frame);
  const total = new Uint8Array(all.reduce((n, f) => n + f.length, 0));
  let o = 0;
  for (const f of all) {
    total.set(f, o);
    o += f.length;
  }
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      if (splitEvery <= 0) c.enqueue(total);
      else
        for (let i = 0; i < total.length; i += splitEvery)
          c.enqueue(total.slice(i, i + splitEvery));
      c.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/vnd.amazon.eventstream' } });
}
