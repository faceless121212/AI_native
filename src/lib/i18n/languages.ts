// The five v1 languages. "en" is UK English (en-GB); see docs/product-spec.md §11.
export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'es', 'it'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: Language = 'en';

export function isLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Picks the first supported language from the device's preferred language tags
 * (e.g. ["pt-BR", "de-AT", "en-US"] → "de"). Only the primary subtag matters.
 */
export function resolveLanguage(tags: readonly (string | null | undefined)[]): Language {
  for (const tag of tags) {
    const primary = tag?.trim().replace('_', '-').split('-')[0]?.toLowerCase();
    if (primary && isLanguage(primary)) return primary;
  }
  return FALLBACK_LANGUAGE;
}
