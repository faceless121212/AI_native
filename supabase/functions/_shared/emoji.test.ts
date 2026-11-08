import { assertEquals } from 'jsr:@std/assert@1';
import { applyEmojiPolicy, emojiAllowed, emojiCount, emojiPolicy } from './emoji.ts';

Deno.test(
  'emoji: allowed only when the incoming text has a pictograph (same rule as the prompt)',
  () => {
    assertEquals(emojiAllowed('Hey, wie geht es dir?'), false);
    assertEquals(emojiAllowed('Kino? 🎬'), true);
    assertEquals(emojiAllowed('Hi 👋🏽'), true);
    assertEquals(emojiAllowed('Ok ❤️'), true);
    // The prompt's rule never counted flags or keycaps; unchanged.
    assertEquals(emojiAllowed('Hallo 🇩🇪'), false);
    assertEquals(emojiAllowed('Option 1️⃣'), false);
  },
);

Deno.test("emoji: policy per card variant (Polish light edit keeps the draft's own emoji)", () => {
  assertEquals(emojiPolicy(false, 'reply'), 'none');
  assertEquals(emojiPolicy(false, 'light'), 'none');
  assertEquals(emojiPolicy(false, 'rewrite'), 'none');
  assertEquals(emojiPolicy(true, 'reply'), 'one');
  assertEquals(emojiPolicy(true, 'rewrite'), 'one');
  assertEquals(emojiPolicy(true, 'light'), 'keep');
});

Deno.test('emoji: none strips pictographs with their FE0F, ZWJ and skin-tone pieces', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none');
  assertEquals(none('Klingt super 😄'), { text: 'Klingt super', changed: true });
  assertEquals(none('Ok ❤️ bis später').text, 'Ok bis später');
  assertEquals(none('Hi 👋🏽 wie geht’s?').text, 'Hi wie geht’s?');
  assertEquals(none('Familie 👨‍👩‍👧 ist da').text, 'Familie ist da');
  assertEquals(none('Love it 🏳️‍🌈').text, 'Love it');
  assertEquals(none('Woman 🤦🏼‍♀️ yes').text, 'Woman yes');
  assertEquals(none('Oh \u263A\uFE0F nice').text, 'Oh nice', 'text-default + VS16 is an emoji');
  assertEquals(none('no emoji here'), { text: 'no emoji here', changed: false });
});

Deno.test('emoji: none strips keycaps, flag pairs, tag flags and stray pieces', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none').text;
  assertEquals(none('Pick 1️⃣ or 2⃣'), 'Pick or');
  assertEquals(none('Ciao 🇮🇹 a presto'), 'Ciao a presto');
  assertEquals(none('Go 🏴󠁧󠁢󠁳󠁣󠁴󠁿 team'), 'Go team');
  assertEquals(none('Stray \u{1F3FD} tone'), 'Stray tone');
  // Digits, # and * without the keycap mark stay.
  assertEquals(none('Room 12 at #3 *now*'), 'Room 12 at #3 *now*');
});

Deno.test('emoji: tidy-up after stripping', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none').text;
  // Double spaces collapse, no space left before punctuation, ends trimmed.
  assertEquals(none('Super 😄, und du?'), 'Super, und du?');
  assertEquals(none('Great 😂😂 . See you'), 'Great. See you');
  assertEquals(none('😍 Sounds good!'), 'Sounds good!');
  assertEquals(none('Sounds good! 😍'), 'Sounds good!');
  assertEquals(none('Haha😄!'), 'Haha!');
  // Glued between two words: they stay apart.
  assertEquals(none('Super😄Danke'), 'Super Danke');
  // French keeps its space before ? ! ; : (lang rule), other punctuation loses it.
  assertEquals(applyEmojiPolicy('Trop bien 😄 !', 'none', 'fr').text, 'Trop bien !');
  assertEquals(applyEmojiPolicy('Trop bien 😄 !', 'none', 'en').text, 'Trop bien!');
  assertEquals(applyEmojiPolicy('Génial 😄, et toi ?', 'none', 'fr').text, 'Génial, et toi ?');
  // Existing spacing away from the emoji is left alone.
  assertEquals(applyEmojiPolicy('Génial ! Et toi ? 😄', 'none', 'fr').text, 'Génial ! Et toi ?');
  // Only emoji → empty (the post-check drops it as `empty`).
  assertEquals(none('😂😂'), '');
  assertEquals(none(' 👍 '), '');
});

Deno.test('emoji: Polish cards keep their newlines', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none').text;
  assertEquals(
    none('Hi Sam 👋,\n\nthanks 🙏 for today.\nSee you 😊\nAlex'),
    'Hi Sam,\n\nthanks for today.\nSee you\nAlex',
  );
  assertEquals(none('😊\nHi'), 'Hi');
  // An emoji alone on its line goes with its line.
  assertEquals(none('Hi Sam,\n😊\nAlex'), 'Hi Sam,\nAlex');
  assertEquals(none('Line one 😄\n\nLine two'), 'Line one\n\nLine two');
});

Deno.test('emoji: one keeps only the first emoji', () => {
  const one = (t: string) => applyEmojiPolicy(t, 'one');
  assertEquals(one('Klingt gut 😄'), { text: 'Klingt gut 😄', changed: false });
  assertEquals(one('Ja 😄 gerne 🎉!'), { text: 'Ja 😄 gerne!', changed: true });
  assertEquals(one('👋🏽 Hi ❤️ 🇩🇪').text, '👋🏽 Hi');
  assertEquals(one('1️⃣ first, 2️⃣ second').text, '1️⃣ first, second');
  assertEquals(emojiCount(one('😂😂😂').text), 1);
});

Deno.test('emoji: keep changes nothing', () => {
  assertEquals(applyEmojiPolicy('Hi 😄😄 ❤️', 'keep'), { text: 'Hi 😄😄 ❤️', changed: false });
});

Deno.test('emoji: count is per emoji (a ZWJ family, a flag or a keycap is one)', () => {
  assertEquals(emojiCount('Hi 👋🏽 ❤️ 👨‍👩‍👧 🇫🇷 1️⃣'), 5);
  assertEquals(emojiCount('none'), 0);
});

Deno.test('emoji: text symbols stay unless they ask for emoji presentation', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none');
  for (const t of [
    'Brand™ ok',
    '© 2026',
    'Acme® yes',
    'Wow‼ yes',
    'A ↔ B',
    'Done ✔',
    'Oh ☺ nice',
  ]) {
    assertEquals(none(t), { text: t, changed: false }, t);
  }
  assertEquals(none('Done \u2714\uFE0F').text, 'Done');
  assertEquals(none('Wow \u203C\uFE0F').text, 'Wow');
  // ✅ has emoji presentation by default.
  assertEquals(none('Done ✅').text, 'Done');
  assertEquals(emojiCount('™ © ® ‼ ↔ ✔'), 0);
});

Deno.test('emoji: VS15 (text presentation) keeps the character', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none');
  assertEquals(none('Love \u2764\uFE0E you'), { text: 'Love \u2764\uFE0E you', changed: false });
  assertEquals(none('Time \u231A\uFE0E now'), { text: 'Time \u231A\uFE0E now', changed: false });
  assertEquals(emojiCount('\u2764\uFE0E'), 0);
  assertEquals(none('Love \u2764\uFE0F you').text, 'Love you');
});

Deno.test('emoji: brackets and quotes left empty are removed', () => {
  const none = (t: string) => applyEmojiPolicy(t, 'none').text;
  assertEquals(none('See you (😄) tomorrow'), 'See you tomorrow');
  assertEquals(none('See you tomorrow (😉)!'), 'See you tomorrow!');
  assertEquals(none('Ok [👍]'), 'Ok');
  assertEquals(applyEmojiPolicy('Il a dit « 😂 » hier', 'none', 'fr').text, 'Il a dit hier');
  // Brackets with text stay.
  assertEquals(none('See you (at 8 😄)'), 'See you (at 8)');
});

Deno.test('emoji: French keeps its space after «', () => {
  const fr = (t: string) => applyEmojiPolicy(t, 'none', 'fr').text;
  assertEquals(fr('Il m’a dit « 😄 Génial ! »'), 'Il m’a dit « Génial ! »');
  assertEquals(fr('« Super 😄 »'), '« Super »');
  assertEquals(applyEmojiPolicy('« 😄 Super »', 'none', 'en').text, '«Super »');
});
