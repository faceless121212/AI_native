// In-memory redaction before the text goes to a model (architecture §7 step 6). Obvious personal
// data is replaced with fixed placeholders the prompt tells the model to keep as-is:
//   [link]  URLs (with or without scheme) carrying credentials: user:password@, token/key/code-
//           like parameters, or random-looking path segments
//   [email]
//   [iban]  any case, compact or grouped with spaces or dashes (mod-97 checked)
//   [card]  13–19 digits, Luhn valid
//   [code]  4–8 digit one-time codes, PINs and TANs next to a code word (en/de/fr/es/it)
//   [phone] 8–15 digits in a phone-like shape; dates, times and year ranges are left alone
// Only counts per type leave this function; never the matched values.

export type RedactionType = 'link' | 'email' | 'iban' | 'card' | 'code' | 'phone';

export const PLACEHOLDERS: Readonly<Record<RedactionType, string>> = {
  link: '[link]',
  email: '[email]',
  iban: '[iban]',
  card: '[card]',
  code: '[code]',
  phone: '[phone]',
};

export interface RedactionResult {
  text: string;
  counts: Record<RedactionType, number>;
  total: number;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
/** Scheme-less: www.… or a bare domain followed by a path, query or fragment. */
const BARE_URL_RE = /(?<![\w@.-])(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?[/?#][^\s<>"']*/gi;
/** user:password@host without a scheme. */
const BARE_USERINFO_RE = /(?<![\w/])[^\s:/@<>"']+:[^\s/@<>"']+@(?:[a-z0-9-]+\.)+[a-z]{2,}\S*/gi;
const URL_USERINFO = /^[a-z][a-z0-9+.-]*:\/\/[^/?#\s]*@/i;
const SECRET_PARAM =
  /[?&#;](?:[a-z0-9_-]*(?:token|key|code|sig|signature|auth|session|sid|secret|pass(?:word)?|pwd|otp|access|ticket|invite|reset|verify|magic)[a-z0-9_-]*)=/i;
/** A path or query segment that looks like a random credential: ≥ 20 chars mixing letters and digits. */
const TOKENISH = /[A-Za-z0-9_-]{20,}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}(?:[ -]?[A-Z0-9]{1,4})?\b/gi;
const DIGIT_RUN_RE = /(?:\+|\b)\d[\d ().\/-]{6,24}\d\b/g;
/** Code candidates: 4–8 digits, or 3+3 with a space or dash ("123 456"). */
const CODE_RE = /(?<![\d+])(?:\d{3}[ -]\d{3}|\d{4,8})(?![\d])/g;
/** Words that mark a one-time code / PIN / TAN (matched on lowercased text without accents). */
const CODE_WORD =
  /(?<![a-z])(?:[a-z]*code[sn]?|codice|codici|codigo|codigos|clave|otp|pin|tan|passcode|mot de passe)(?![a-z])/;
const CODE_WINDOW = 30;

/** Shapes the phone rule must not touch; masked before and restored after. */
const PROTECT_RES = [
  // Year ranges: 2024-2026, 1999 – 2003, 2024/25 is not a range of two full years so it stays.
  /\b(?:19|20)\d{2}\s?[-–/]\s?(?:19|20)\d{2}\b/g,
  // Dates: 12.05.2026, 1/2/26, 2026-11-02 (not when more digit groups follow: phone numbers).
  /(?<![\d./-])\d{1,4}[./-]\d{1,2}[./-]\d{1,4}(?![./-]?\d)/g,
  // Times: 18:30, 9:05:10, 18h30.
  /\b\d{1,2}(?::\d{2}){1,2}\b|\b\d{1,2}h\d{2}\b/g,
];

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function looksLikeCredentialUrl(url: string): boolean {
  if (URL_USERINFO.test(url)) return true;
  if (SECRET_PARAM.test(url)) return true;
  const afterHost = url.replace(/^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#]+/i, '');
  for (const segment of afterHost.match(TOKENISH) ?? []) {
    if (/\d/.test(segment) && /[A-Za-z]/.test(segment)) return true;
  }
  return false;
}

function ibanValid(raw: string): boolean {
  const iban = raw.replace(/[ -]/g, '').toUpperCase();
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
  const counts: Record<RedactionType, number> = {
    link: 0,
    email: 0,
    iban: 0,
    card: 0,
    code: 0,
    phone: 0,
  };
  const hit = (type: RedactionType) => {
    counts[type]++;
    return PLACEHOLDERS[type];
  };
  // Our private-use markers can't come from the user.
  let text = input.replace(/[\uE000\uE001]/g, '');

  text = text.replace(URL_RE, (url) => (looksLikeCredentialUrl(url) ? hit('link') : url));
  text = text.replace(BARE_USERINFO_RE, () => hit('link'));
  text = text.replace(BARE_URL_RE, (url) => (looksLikeCredentialUrl(url) ? hit('link') : url));
  text = text.replace(EMAIL_RE, () => hit('email'));
  text = text.replace(IBAN_RE, (match) => (ibanValid(match) ? hit('iban') : match));

  // Protect dates, times and year ranges from the number rules (private-use markers, no digits).
  const masked: string[] = [];
  for (const re of PROTECT_RES) {
    text = text.replace(re, (match) => {
      masked.push(match);
      return `\uE000${String.fromCharCode(0xe100 + masked.length - 1)}\uE001`;
    });
  }

  text = text.replace(DIGIT_RUN_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? hit('card') : match;
  });

  text = text.replace(CODE_RE, (match, offset: number, whole: string) => {
    const before = stripAccents(whole.slice(Math.max(0, offset - CODE_WINDOW), offset));
    const after = stripAccents(
      whole.slice(offset + match.length, offset + match.length + CODE_WINDOW),
    );
    return CODE_WORD.test(before) || CODE_WORD.test(after) ? hit('code') : match;
  });

  text = text.replace(DIGIT_RUN_RE, (match) => {
    const trimmed = match.trim();
    const digits = trimmed.replace(/\D/g, '');
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
      return hit('phone');
    }
    return match;
  });

  text = text.replace(
    /\uE000([\uE100-\uEFFF])\uE001/g,
    (_m, ch: string) => masked[ch.charCodeAt(0) - 0xe100] ?? '',
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total };
}
