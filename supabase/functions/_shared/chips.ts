// Chip validation (architecture §7 step 5, spec §3.2):
//  - Flirty tone is hidden for Colleague and Family → forced to Warm.
//  - Flirt level exists only for Match and Partner → forced Off for everyone else.
// The client hides these chips already; the server enforces them.
import type { FlirtLevel, Relationship, ReplyRequest, Tone } from './schemas.ts';

const NO_FLIRTY_TONE: readonly Relationship[] = ['colleague', 'family'];
const FLIRT_LEVEL_ALLOWED: readonly Relationship[] = ['match', 'partner'];

export interface ValidatedChips {
  tone: Tone;
  flirt: FlirtLevel;
  /** True when anything was changed. */
  forced: boolean;
}

export function validateChips(
  req: Pick<ReplyRequest, 'relationship' | 'tone' | 'flirt'>,
): ValidatedChips {
  let { tone, flirt } = req;
  if (tone === 'flirty' && NO_FLIRTY_TONE.includes(req.relationship)) tone = 'warm';
  if (flirt !== 'off' && !FLIRT_LEVEL_ALLOWED.includes(req.relationship)) flirt = 'off';
  return { tone, flirt, forced: tone !== req.tone || flirt !== req.flirt };
}
