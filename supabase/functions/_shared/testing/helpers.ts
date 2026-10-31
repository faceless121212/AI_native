// Test helpers: request builders and a console spy that records everything functions log.

export function jsonRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
  path = '/',
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function device(key: string): Record<string, string> {
  return { authorization: `Device ${key}` };
}

const METHODS = ['log', 'info', 'debug', 'warn', 'error', 'trace'] as const;

/** Captures console output while `fn` runs; returns every logged line as one string each. */
export async function captureConsole<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const originals = METHODS.map((m) => [m, console[m]] as const);
  for (const m of METHODS) {
    console[m] = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  }
  try {
    return { result: await fn(), lines };
  } finally {
    for (const [m, original] of originals) console[m] = original;
  }
}
