import 'i18next';

import type { resources } from './resources';

// Type-checked translation keys: t('keyboard:bar.offline') compiles, a typo doesn't.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['en'];
  }
}
