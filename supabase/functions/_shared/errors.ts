// Typed HTTP errors. Every error response body is {error: ErrorCode, message} (schemas.ts).
import type { ErrorCode, ErrorResponse } from './schemas.ts';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unknown_policy_version: 400,
  unauthorized: 401,
  quota_empty: 402,
  ai_off: 403,
  age_required: 403,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate: 429,
  fair_use: 429,
  internal: 500,
  provider_down: 503,
};

export class HttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(
    readonly code: ErrorCode,
    message: string,
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = STATUS[code];
    this.headers = headers;
  }
}

export function httpError(code: ErrorCode, message: string): HttpError {
  return new HttpError(code, message);
}

export function methodNotAllowed(allowed: readonly string[]): HttpError {
  return new HttpError('method_not_allowed', `Use ${allowed.join(' or ')}.`, {
    Allow: allowed.join(', '),
  });
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  // Responses are per user and may carry a device key: never cache.
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function errorResponse(err: HttpError): Response {
  const body: ErrorResponse = { error: err.code, message: err.message };
  return jsonResponse(body, err.status, err.headers);
}
