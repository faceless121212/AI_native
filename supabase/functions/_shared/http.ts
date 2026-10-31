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

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw httpError('payload_too_large', 'Request body is too large.');
  }

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
