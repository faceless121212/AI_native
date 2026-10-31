// Request parsing and the top-level handler wrapper shared by every Edge Function.
import type { z } from 'zod';
import { errorResponse, HttpError, httpError } from './errors.ts';
import { logError } from './log.ts';

export const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

/**
 * Reads a JSON body and validates it. Error messages name fields and issue codes only, never
 * the submitted values, and the body is never logged.
 */
export async function readJson<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<z.output<S>> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw httpError('unsupported_media_type', 'Send Content-Type: application/json.');
  }
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw httpError('payload_too_large', 'Request body is too large.');

  // Content-Length can be missing (chunked) or wrong: count bytes while reading and stop as
  // soon as the limit is passed, so a large body is never buffered.
  const raw = await readBodyLimited(req, maxBytes);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw httpError('bad_request', 'Body is not valid JSON.');
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.code}`)
      .join('; ');
    throw httpError('bad_request', `Invalid request (${fields}).`);
  }
  return parsed.data;
}

/** Reads at most maxBytes of the body; cancels the stream and throws 413 beyond that. */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw httpError('payload_too_large', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export type Handler = (req: Request) => Promise<Response>;

/** Maps HttpError to its JSON response; anything else becomes a 500 with nothing leaked. */
export function withErrors(fn: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      logError(fn, 'unhandled', err);
      return errorResponse(httpError('internal', 'Something went wrong. Try again.'));
    }
  };
}
