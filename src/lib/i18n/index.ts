import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { FALLBACK_LANGUAGE, resolveLanguage } from './languages';
import { NAMESPACES, resources } from './resources';

export {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  type Language,
} from './languages';

/** Device language mapped to one of the five supported languages. */
export function deviceLanguage() {
  return resolveLanguage(getLocales().map((locale) => locale.languageTag));
}

const instance = createInstance();

void instance.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes.
  returnNull: false,
  initAsync: false,
});

export const i18n = instance;
