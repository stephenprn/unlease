/**
 * Lint for the shared packages (`packages/`); each program lints its own code with its own config.
 * The packages compile into the phone, the web and the server, so they import no third-party
 * module, no platform and no framework, and they keep their order:
 * core <- design <- each app's package, in the order their reads give (notes, contacts <- calendar
 * <- pages: Agenda shows contacts' birthdays and Carnet's reminders; Pages shows Carnet's
 * collections, notes and links, and mentions contacts and events; Carnet and Contacts import no other
 * app's package). A new app's package slots in after those it reads; an app below names what it
 * mentions of one above through what its program hands it (`notes/services/noteMentions`).
 */
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Case-sensitive on purpose: `carnet.sqlite` and `carnet://` are machine strings. */
const NAMES = {
  selector: 'Literal[value=/Carnet|Unlease/], TemplateElement[value.raw=/Carnet|Unlease/]',
  message: 'Use SUITE_NAME or the app registry (@unlease/core/apps), or APP_NAME from the app’s brand, rather than writing a name out.',
};

/** Anything but a relative path or another shared package: the packages stay free of dependencies. */
const THIRD_PARTY = { regex: '^(?!\\.|@unlease/)', message: 'The shared packages import no third-party module, platform or framework.' };

const layer = (...below) => [
  'error',
  {
    patterns: [
      THIRD_PARTY,
      ...below.map(name => ({ group: [`@unlease/${name}/*`], message: `@unlease/${name} sits above this package: move the code down or pass it in.` })),
    ],
  },
];

export default defineConfig(
  { ignores: ['**/node_modules/', '**/dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', NAMES],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // French typography: no-break spaces belong in copy.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
  { files: ['packages/core/src/**/*.ts'], rules: { 'no-restricted-imports': layer('design', 'notes', 'contacts', 'calendar', 'pages') } },
  { files: ['packages/design/src/**/*.ts'], rules: { 'no-restricted-imports': layer('notes', 'contacts', 'calendar', 'pages') } },
  { files: ['packages/notes/src/**/*.ts'], rules: { 'no-restricted-imports': layer('contacts', 'calendar', 'pages') } },
  { files: ['packages/contacts/src/**/*.ts'], rules: { 'no-restricted-imports': layer('notes', 'calendar', 'pages') } },
  { files: ['packages/calendar/src/**/*.ts'], rules: { 'no-restricted-imports': layer('pages') } },
  { files: ['packages/pages/src/**/*.ts'], rules: { 'no-restricted-imports': layer() } },
  {
    // Where the names are written out, once.
    files: ['packages/core/src/apps.ts', 'packages/core/src/appWords.ts', 'packages/notes/src/brand.ts', 'packages/contacts/src/brand.ts', 'packages/calendar/src/brand.ts', 'packages/pages/src/brand.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['packages/**/__tests__/**'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
);
