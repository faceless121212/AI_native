import { assertEquals } from 'jsr:@std/assert@1';
import { validateChips } from './chips.ts';

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
