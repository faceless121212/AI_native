import deCommon from '../../../locales/de/common.json';
import deKeyboard from '../../../locales/de/keyboard.json';
import deNotifications from '../../../locales/de/notifications.json';
import deOnboarding from '../../../locales/de/onboarding.json';
import dePaywall from '../../../locales/de/paywall.json';
import enCommon from '../../../locales/en/common.json';
import enKeyboard from '../../../locales/en/keyboard.json';
import enNotifications from '../../../locales/en/notifications.json';
import enOnboarding from '../../../locales/en/onboarding.json';
import enPaywall from '../../../locales/en/paywall.json';
import esCommon from '../../../locales/es/common.json';
import esKeyboard from '../../../locales/es/keyboard.json';
import esNotifications from '../../../locales/es/notifications.json';
import esOnboarding from '../../../locales/es/onboarding.json';
import esPaywall from '../../../locales/es/paywall.json';
import frCommon from '../../../locales/fr/common.json';
import frKeyboard from '../../../locales/fr/keyboard.json';
import frNotifications from '../../../locales/fr/notifications.json';
import frOnboarding from '../../../locales/fr/onboarding.json';
import frPaywall from '../../../locales/fr/paywall.json';
import itCommon from '../../../locales/it/common.json';
import itKeyboard from '../../../locales/it/keyboard.json';
import itNotifications from '../../../locales/it/notifications.json';
import itOnboarding from '../../../locales/it/onboarding.json';
import itPaywall from '../../../locales/it/paywall.json';

import type { Language } from './languages';

// Namespaces = file names in locales/<lang>/. Keep in sync with scripts/i18n-check.ts.
export const NAMESPACES = ['common', 'onboarding', 'keyboard', 'paywall', 'notifications'] as const;

export const resources = {
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    keyboard: enKeyboard,
    paywall: enPaywall,
    notifications: enNotifications,
  },
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    keyboard: deKeyboard,
    paywall: dePaywall,
    notifications: deNotifications,
  },
  fr: {
    common: frCommon,
    onboarding: frOnboarding,
    keyboard: frKeyboard,
    paywall: frPaywall,
    notifications: frNotifications,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    keyboard: esKeyboard,
    paywall: esPaywall,
    notifications: esNotifications,
  },
  it: {
    common: itCommon,
    onboarding: itOnboarding,
    keyboard: itKeyboard,
    paywall: itPaywall,
    notifications: itNotifications,
  },
} satisfies Record<Language, Record<(typeof NAMESPACES)[number], unknown>>;
