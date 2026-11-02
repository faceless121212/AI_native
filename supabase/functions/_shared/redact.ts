// In-memory redaction before the text goes to a model (architecture §7 step 6). Obvious personal
// data is replaced with placeholders the prompt tells the model to keep as-is:
//   [link] URLs carrying tokens/keys/codes · [email] · [iban] (mod-97 valid) · [card] (13–19
//   digits, Luhn valid) · [phone] (8–15 digits in a phone-like shape, not dates)
// Only counts per type leave this function; never the matched values.

export type RedactionType = 'link' | 'email' | 'iban' | 'card' | 'phone';

export interface RedactionResult {
  text: string;
  counts: Record<RedactionType, number>;
  total: number;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const SECRET_PARAM =
  /[?&#;](?:[a-z0-9_-]*(?:token|key|code|sig|signature|auth|session|sid|secret|pass(?:word)?|pwd|otp|access|ticket|invite|reset|verify|magic)[a-z0-9_-]*)=/i;
/** A path or query segment that looks like a random credential: ≥ 20 chars mixing letters and digits. */
const TOKENISH = /[A-Za-z0-9_-]{20,}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Uppercase IBAN, compact or in groups of 4 (mod-97 checked below). */
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
const DIGIT_RUN_RE = /(?:\+|\b)\d[\d ().\/-]{6,24}\d\b/g;
const DATE_RE = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;
const TIME_RANGE_RE = /^\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2}$/;

function looksLikeCredentialUrl(url: string): boolean {
  if (SECRET_PARAM.test(url)) return true;
  const afterHost = url.replace(/^https?:\/\/[^/?#]+/i, '');
  for (const segment of afterHost.match(TOKENISH) ?? []) {
    if (/\d/.test(segment) && /[A-Za-z]/.test(segment)) return true;
  }
  return false;
}

function ibanValid(raw: string): boolean {
  const iban = raw.replace(/ /g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redact(input: string): RedactionResult {
  const counts: Record<RedactionType, number> = { link: 0, email: 0, iban: 0, card: 0, phone: 0 };
  let text = input;

  text = text.replace(URL_RE, (url) => {
    if (!looksLikeCredentialUrl(url)) return url;
    counts.link++;
    return '[link]';
  });
  text = text.replace(EMAIL_RE, () => {
    counts.email++;
    return '[email]';
  });
  text = text.replace(IBAN_RE, (match) => {
    if (!ibanValid(match)) return match;
    counts.iban++;
    return '[iban]';
  });
  text = text.replace(DIGIT_RUN_RE, (match) => {
    const trimmed = match.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (DATE_RE.test(trimmed) || TIME_RANGE_RE.test(trimmed)) return match;
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      counts.card++;
      return '[card]';
    }
    const international = trimmed.startsWith('+') || trimmed.startsWith('00');
    const trunk = trimmed.startsWith('0');
    const plain = /^\d+$/.test(trimmed);
    // Phone: 8–15 digits. Unformatted runs need a phone prefix (0 / + / 00) or 9+ digits, so
    // plain numbers like order IDs of 8 digits stay.
    if (
      digits.length >= 8 &&
      digits.length <= 15 &&
      (international || trunk || !plain || digits.length >= 9)
    ) {
      counts.phone++;
      return '[phone]';
    }
    return match;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total };
}
