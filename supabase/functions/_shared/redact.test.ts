import { assertEquals } from 'jsr:@std/assert@1';
import { redact } from './redact.ts';

Deno.test('redact: emails, phones in five countries, IBAN, card, token links', () => {
  const cases: Array<[string, string]> = [
    ['write to anna.m+x@mail.example.co.uk ok', 'write to [email] ok'],
    ['call +44 7700 900123', 'call [phone]'],
    ['ruf 0151 23456789 an', 'ruf [phone] an'],
    ['appelle le 06 12 34 56 78', 'appelle le [phone]'],
    ['llámame al 612 345 678', 'llámame al [phone]'],
    ['chiamami 333 1234567', 'chiamami [phone]'],
    ['0049 30 1234567', '[phone]'],
    ['IBAN DE89 3704 0044 0532 0130 00 thanks', 'IBAN [iban] thanks'],
    ['GB82WEST12345698765432', '[iban]'],
    ['card 4111 1111 1111 1111 exp', 'card [card] exp'],
    ['reset: https://app.example.com/reset?token=abc123', 'reset: [link]'],
    ['https://x.example/s/Ab3dEf9hIjK1mNoP2rStU', '[link]'],
  ];
  for (const [input, expected] of cases) assertEquals(redact(input).text, expected, input);
});

Deno.test(
  'redact: leaves ordinary text, dates, times, prices, short numbers and plain links alone',
  () => {
    const keep = [
      'See you on 12.05.2026 at 18:30',
      'Treffen 2026-11-02, 9:00-10:30',
      'It costs €1.234,56 or 39.99',
      'Order 12345678 arrived',
      'Room 101, bus 42',
      'Look https://www.example.com/menu',
      'DEAL with it, ITALIA 2026 rocks',
      'Not an IBAN: DE00 1234 5678 9012 3456 78',
      'Not a card: 4111 1111 1111 1112',
    ];
    for (const text of keep) {
      const r = redact(text);
      assertEquals(r.text, text, text);
      assertEquals(r.total, 0);
    }
  },
);

Deno.test('redact: counts by type and never returns the removed values', () => {
  const r = redact('a@b.de, c@d.fr, +33 6 12 34 56 78');
  assertEquals(r.counts, { link: 0, email: 2, iban: 0, card: 0, phone: 1 });
  assertEquals(r.total, 3);
  assertEquals(Object.keys(r).sort(), ['counts', 'text', 'total']);
});
