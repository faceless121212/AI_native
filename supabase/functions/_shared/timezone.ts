// IANA time zone check using the runtime's tz database (the database checks again).
export function isIanaTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
