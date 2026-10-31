// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'dist/**',
      'coverage/**',
      'targets/**',
      'modules/*/android/**',
      'modules/*/ios/**',
      'supabase/functions/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'import/no-default-export': 'error',
    },
  },
  {
    // Expo Router screens and config files are the only places default exports are allowed.
    files: ['app/**/*.tsx', 'app.config.ts', '*.config.js'],
    rules: { 'import/no-default-export': 'off' },
  },
]);
