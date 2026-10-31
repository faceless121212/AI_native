// Runs before each test file (jest.config.js setupFilesAfterEnv).
import { i18n } from '@/lib/i18n';

// Tests assert English copy; the device language in the test environment is not reliable.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});
