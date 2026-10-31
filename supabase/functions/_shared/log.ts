// The only logging Edge Functions may do. No request bodies, no message text, no keys, no tokens
// (CLAUDE.md rule 5): fields are restricted to short scalar codes, and errors are reduced to their
// class name and code, because driver error messages can echo row values.

type LogValue = string | number | boolean | null;

export function logEvent(fn: string, event: string, fields: Record<string, LogValue> = {}): void {
  console.info(JSON.stringify({ fn, event, ...fields }));
}

export function logError(fn: string, where: string, err: unknown): void {
  const name = err instanceof Error ? err.name : typeof err;
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
      ? err.code
      : null;
  console.error(JSON.stringify({ fn, event: 'error', where, name, code }));
}
