// PLACEHOLDER (Prompt 3): prompt-engineer replaces these lists in Prompt 4 / Prompt 12.
// Post-check lists (architecture §7 step 10): a card containing any entry is dropped.
// Matching is case- and accent-insensitive on word boundaries; a trailing "*" matches a prefix.
// Keep entries lowercase. Never put user text here.

/** Explicit terms (spec §9: no sexual or explicit replies at any setting). */
export const EXPLICIT_TERMS: readonly string[] = [
  // Test sentinel used by the fake provider's "explicit" scenario. Keep.
  'xxx-explicit-term',
  'send nudes',
  'nudes',
  'nacktbild*',
  'photos nues',
  'fotos desnud*',
  'foto nud*',
];

/** Phrases that break "sounds like a real person" or the no-coach-persona rule (spec §4, §9). */
export const BANNED_PHRASES: readonly string[] = [
  'as an ai',
  'as a language model',
  'als ki',
  'als sprachmodell',
  "en tant qu'ia",
  'como ia',
  'como modelo de lenguaje',
  'come ia',
  'come modello linguistico',
];
