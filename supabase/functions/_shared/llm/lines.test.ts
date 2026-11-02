import { assertEquals } from 'jsr:@std/assert@1';
import { LineParser, type ParsedItem } from './lines.ts';

const OUTPUT =
  'R1|Klingt super! Wie war dein Wochenende?\n' +
  'R2|Schön, dass du dich meldest.\r\n' +
  'META|{"lang":"de","crisis":false,"refused":false}\n' +
  'R3|Kaffee diese Woche? 😊';

const EXPECTED: ParsedItem[] = [
  { type: 'card', tag: 'R1', text: 'Klingt super! Wie war dein Wochenende?' },
  { type: 'card', tag: 'R2', text: 'Schön, dass du dich meldest.' },
  { type: 'meta', meta: { lang: 'de', crisis: false, refused: false } },
  { type: 'card', tag: 'R3', text: 'Kaffee diese Woche? 😊' },
];

function parseInChunks(text: string, cuts: number[]): ParsedItem[] {
  const p = new LineParser('reply');
  const items: ParsedItem[] = [];
  let last = 0;
  for (const cut of [...cuts, text.length]) {
    items.push(...p.push(text.slice(last, cut)));
    last = cut;
  }
  return [...items, ...p.end('complete')];
}

Deno.test('lines: same result for every single split point (incl. inside \\r\\n and emoji)', () => {
  for (let i = 0; i <= OUTPUT.length; i++) {
    assertEquals(parseInChunks(OUTPUT, [i]), EXPECTED, `split at ${i}`);
  }
});

Deno.test('lines: one character at a time, and every pair of split points', () => {
  const cuts = Array.from({ length: OUTPUT.length }, (_, i) => i);
  assertEquals(parseInChunks(OUTPUT, cuts), EXPECTED);
  for (let i = 0; i < OUTPUT.length; i += 3) {
    for (let j = i; j < OUTPUT.length; j += 5)
      assertEquals(parseInChunks(OUTPUT, [i, j]), EXPECTED);
  }
});

Deno.test('lines: a card is emitted as soon as its newline arrives', () => {
  const p = new LineParser('reply');
  assertEquals(p.push('R1|Hel'), []);
  assertEquals(p.push('lo'), []);
  assertEquals(p.push('\nR2'), [{ type: 'card', tag: 'R1', text: 'Hello' }]);
});

Deno.test('lines: polish tags; reply tags are wrong for polish and vice versa', () => {
  const p = new LineParser('polish');
  assertEquals(p.push('L|light\nW|rewrite\nR1|nope\n'), [
    { type: 'card', tag: 'L', text: 'light' },
    { type: 'card', tag: 'W', text: 'rewrite' },
    { type: 'invalid', reason: 'wrong_kind' },
  ]);
  assertEquals(new LineParser('reply').push('L|x\n'), [{ type: 'invalid', reason: 'wrong_kind' }]);
});

Deno.test('lines: untagged, empty and bad META lines are invalid; blank lines ignored', () => {
  const p = new LineParser('reply');
  assertEquals(
    p.push('Here you go:\n\nR1|\nMETA|{oops\nMETA|{"crisis":"yes"}\n  R2 | spaced  \n'),
    [
      { type: 'invalid', reason: 'untagged' },
      { type: 'invalid', reason: 'empty' },
      { type: 'invalid', reason: 'bad_meta' },
      { type: 'invalid', reason: 'bad_meta' },
      { type: 'card', tag: 'R2', text: 'spaced' },
    ],
  );
});

Deno.test('lines: META defaults and pipes inside card text', () => {
  const p = new LineParser('reply');
  assertEquals(p.push('META|{"lang":"fr"}\nR1|a | b\n'), [
    { type: 'meta', meta: { lang: 'fr', crisis: false, refused: false } },
    { type: 'card', tag: 'R1', text: 'a | b' },
  ]);
});

Deno.test('lines: unfinished last line counts at a complete end, is dropped when truncated', () => {
  const a = new LineParser('reply');
  a.push('R1|done\nR2|half');
  assertEquals(a.end('complete'), [{ type: 'card', tag: 'R2', text: 'half' }]);
  const b = new LineParser('reply');
  b.push('R1|done\nR2|half');
  assertEquals(b.end('truncated'), []);
});

Deno.test(
  'lines: a line without newline beyond 4000 chars is dropped, then parsing recovers',
  () => {
    const p = new LineParser('reply');
    const items = [...p.push('R1|' + 'x'.repeat(5000)), ...p.push('still the same line\nR2|ok\n')];
    assertEquals(items, [
      { type: 'invalid', reason: 'too_long_line' },
      { type: 'card', tag: 'R2', text: 'ok' },
    ]);
  },
);
