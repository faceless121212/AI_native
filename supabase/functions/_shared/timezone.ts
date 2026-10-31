// IANA time zones: validated and canonicalised with the runtime's tz database ('europe/berlin'
// → 'Europe/Berlin'); the database checks the stored name again.
export function canonicalTimeZone(name: string): string | null {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
