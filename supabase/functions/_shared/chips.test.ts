import { assertEquals } from 'jsr:@std/assert@1';
import { validateChips, withoutFlirting } from './chips.ts';

Deno.test(
  'chips: Flirty tone → Warm for Colleague and Family; flirt level only for Match/Partner',
  () => {
    assertEquals(validateChips({ relationship: 'colleague', tone: 'flirty', flirt: 'playful' }), {
      tone: 'warm',
      flirt: 'off',
      forced: true,
    });
    assertEquals(validateChips({ relationship: 'family', tone: 'flirty', flirt: 'off' }), {
      tone: 'warm',
      flirt: 'off',
      forced: true,
    });
    assertEquals(validateChips({ relationship: 'friend', tone: 'flirty', flirt: 'light' }), {
      tone: 'flirty',
      flirt: 'off',
      forced: true,
    });
    assertEquals(validateChips({ relationship: 'match', tone: 'flirty', flirt: 'playful' }), {
      tone: 'flirty',
      flirt: 'playful',
      forced: false,
    });
    assertEquals(validateChips({ relationship: 'partner', tone: 'warm', flirt: 'light' }), {
      tone: 'warm',
      flirt: 'light',
      forced: false,
    });
    assertEquals(validateChips({ relationship: 'colleague', tone: 'professional', flirt: 'off' }), {
      tone: 'professional',
      flirt: 'off',
      forced: false,
    });
  },
);

Deno.test('chips: no flirting with someone who says they are a minor (spec §9)', () => {
  assertEquals(withoutFlirting({ tone: 'flirty', flirt: 'off', forced: false }), {
    tone: 'warm',
    flirt: 'off',
    forced: true,
  });
  assertEquals(withoutFlirting({ tone: 'flirty', flirt: 'playful', forced: false }), {
    tone: 'warm',
    flirt: 'off',
    forced: true,
  });
  // Other tones are the user's choice and carry no flirting: unchanged.
  assertEquals(withoutFlirting({ tone: 'apologise', flirt: 'off', forced: false }), {
    tone: 'apologise',
    flirt: 'off',
    forced: false,
  });
  assertEquals(withoutFlirting({ tone: 'funny', flirt: 'off', forced: true }), {
    tone: 'funny',
    flirt: 'off',
    forced: true,
  });
});
