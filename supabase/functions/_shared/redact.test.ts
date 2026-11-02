import { assertEquals } from 'jsr:@std/assert@1';
import { PLACEHOLDERS, redact } from './redact.ts';

function check(cases: Array<[string, string]>) {
  for (const [input, expected] of cases) assertEquals(redact(input).text, expected, input);
}

Deno.test('redact: emails, phones in five countries, cards', () => {
  check([
    ['write to anna.m+x@mail.example.co.uk ok', 'write to [email] ok'],
    ['call +44 7700 900123', 'call [phone]'],
    ['ruf 0151 23456789 an', 'ruf [phone] an'],
    ['appelle le 06 12 34 56 78', 'appelle le [phone]'],
    ['appelle le 06.12.34.56.78', 'appelle le [phone]'],
    ['llámame al 612 345 678', 'llámame al [phone]'],
    ['chiamami 333 1234567', 'chiamami [phone]'],
    ['0049 30 1234567', '[phone]'],
    ['card 4111 1111 1111 1111 exp', 'card [card] exp'],
  ]);
});

Deno.test('redact: IBANs in any case, compact or with spaces or dashes', () => {
  check([
    ['IBAN DE89 3704 0044 0532 0130 00 thanks', 'IBAN [iban] thanks'],
    // The IBAN pattern must not swallow the start of the next word (found by the Prompt 4 evals).
    ['Send to ES91 2100 0418 4502 0005 1332 today please', 'Send to [iban] today please'],
    ['Send to ES9121000418450200051332 today please', 'Send to [iban] today please'],
    ['IBAN IT60X0542811101000000123456 asap', 'IBAN [iban] asap'],
    // Country code + registered length: the IBAN is cut where its groups end, and nothing after it
    // is swallowed ("ok", "today").
    ['IBAN DE89 3704 0044 0532 0130 00 ok', 'IBAN [iban] ok'],
    // An IBAN with a typo (bad checksum) still gives away the account, so it is redacted.
    ['IBAN DE89 3704 0044 0532 0130 01 thanks', 'IBAN [iban] thanks'],
    ['RIB FR14 2004 1010 0505 0001 3M02 606 demain stp', 'RIB [iban] demain stp'],
    ['iban de89 3704 0044 0532 0130 00', 'iban [iban]'],
    ['DE89-3704-0044-0532-0130-00', '[iban]'],
    ['GB82WEST12345698765432', '[iban]'],
    ['gb82west12345698765432.', '[iban].'],
    ['FR14 2004 1010 0505 0001 3M02 606', '[iban]'],
  ]);
});

Deno.test('redact: links with credentials, with or without scheme; userinfo', () => {
  check([
    ['reset: https://app.example.com/reset?token=abc123', 'reset: [link]'],
    ['https://x.example/s/Ab3dEf9hIjK1mNoP2rStU', '[link]'],
    ['go to www.example.com/login?session=abc', 'go to [link]'],
    ['example.com/verify?code=99881', '[link]'],
    ['bank.example.de/r/9fK2LmQ81vXz7TqP0aBc', '[link]'],
    ['https://anna:hunter2@files.example.com/x', '[link]'],
    ['ftp login anna:hunter2@files.example.com', 'ftp login [link]'],
  ]);
});

Deno.test('redact: one-time codes, PINs and TANs next to a code word (5 languages)', () => {
  check([
    ['Your code is 482913', 'Your code is [code]'],
    ['482913 is your verification code', '[code] is your verification code'],
    ['OTP: 123 456', 'OTP: [code]'],
    ['my PIN is 1234', 'my PIN is [code]'],
    ['Dein Bestätigungscode lautet 5521', 'Dein Bestätigungscode lautet [code]'],
    ['TAN 774411 eingeben', 'TAN [code] eingeben'],
    ['Votre code de vérification : 8812', 'Votre code de vérification : [code]'],
    ['Tu código es 90817', 'Tu código es [code]'],
    ['Il tuo codice è 31415926', 'Il tuo codice è [code]'],
  ]);
});

Deno.test(
  'redact: leaves ordinary text, dates, times, year ranges, prices and plain links alone',
  () => {
    const keep = [
      'See you on 12.05.2026 at 18:30',
      'Treffen am 12.05.2026 18:30 Uhr',
      'Termin 02.11.2026 um 18.30',
      'Treffen 2026-11-02, 9:00-10:30',
      'Studied there 2019-2023, then 2024 – 2026',
      'rendez-vous à 18h30',
      'It costs €1.234,56 or 39.99',
      'Order 12345678 arrived',
      'Room 101, bus 42, 1234 steps',
      'Look https://www.example.com/menu and www.example.com/about',
      'DEAL with it, ITALIA 2026 rocks',
      // A German-length IBAN with a bad checksum is now redacted on purpose (a typo still reveals
      // the account), so the leave-alone example is a reference with no registered country code.
      'Not an IBAN: VJ00 1234 5678 9012 3456 78',
      'Not a card: 4111 1111 1111 1112',
      'pinned 2048 photos',
    ];
    for (const text of keep) {
      const r = redact(text);
      assertEquals(r.text, text, text);
      assertEquals(r.total, 0, text);
    }
  },
);

Deno.test('redact: counts by type, fixed placeholders, never returns removed values', () => {
  const r = redact('a@b.de, c@d.fr, +33 6 12 34 56 78, code 4455');
  assertEquals(r.counts, { link: 0, email: 2, iban: 0, card: 0, code: 1, phone: 1 });
  assertEquals(r.total, 4);
  assertEquals(Object.keys(r).sort(), ['counts', 'text', 'total']);
  assertEquals(Object.values(PLACEHOLDERS), [
    '[link]',
    '[email]',
    '[iban]',
    '[card]',
    '[code]',
    '[phone]',
  ]);
  assertEquals(redact('xy').text, 'xy', 'user text cannot forge our markers');
});

Deno.test(
  'redact leaves IBAN-shaped references with unknown country codes or wrong lengths alone',
  () => {
    for (const text of [
      'order VJ09 8657 2093 4093 5657 5545 8698 ok',
      'ref DN82 6911 7561 2094 9390 1364 8381',
      'ticket AB12CD34EF56GH78 is ready',
    ]) {
      assertEquals(redact(text).counts.iban, 0, text);
    }
  },
);

Deno.test(
  'redact treats a registered-length IBAN with a bad checksum as an IBAN (a typo still reveals the account)',
  () => {
    assertEquals(redact('Not an IBAN: DE00 1234 5678 9012 3456 78').text, 'Not an IBAN: [iban]');
  },
);
