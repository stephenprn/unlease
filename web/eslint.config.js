/**
 * Lint for the suite's web apps. House rules ride on top of the recommended sets:
 *
 *  - the names are `SUITE_NAME`, `APPS.<id>.name` or an app's `APP_NAME` and nothing else (the
 *    same rule the phone enforces), so a rename stays a one-line change;
 *  - the areas point down: `shared` (the shell) imports no app, Pages' app (`pages`) may import
 *    Carnet's (`notes`: it shows its collections and links) and Contacts' (`contacts`: it mentions
 *    contacts), never the other way; Carnet reads Contacts' data alone (`@contacts/data`, its
 *    library: it names the people its notes mention), Contacts never imports Carnet; Agenda
 *    (`calendar`) reads Carnet's and Contacts' data (their reminders, birthdays and names) and
 *    nothing of their screens, and the others read Agenda's data alone (`@calendar/data`, its
 *    library: they name the events they mention); only the demo
 *    (`demo`) and the tests' setup (`shared/test`) see them all;
 *  - an area's `ui` reaches storage only through its `app`, so a component never couples itself
 *    to IndexedDB.
 *
 * The shared packages (`@unlease/*`) are linted by the repository root's config, not here.
 */
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const BRAND_LITERAL = {
  selector: 'Literal[value=/Carnet|Unlease/], TemplateElement[value.raw=/Carnet|Unlease/]',
  message: 'Use APPS.<id>.name or SUITE_NAME from @unlease/core/apps (or an app\'s APP_NAME) rather than writing a name out.',
};

/** An area's `ui` never reaches IndexedDB but through its `app`. */
const NO_DB = { group: ['**/app/db/*', '**/app/db'], message: 'ui goes through app (a hook or an action), never to IndexedDB.' };

/** The shell knows no app: an app brings itself through its module (`shared/src/modules`). */
const NO_APPS = [
  { group: ['@notes/*', '@pages/*', '@contacts/*', '@calendar/*', '@demo/*'], message: 'The shell imports no app: the app brings it through its module (shared/src/modules).' },
  { group: ['@unlease/notes/*', '@unlease/pages/*', '@unlease/contacts/*', '@unlease/calendar/*'], message: 'The shell imports no app\'s package: only core and design.' },
];

/** Carnet knows nothing of Pages, but the one route it calls (« Garder une copie »). */
const NO_PAGES = [
  { group: ['@pages/*'], message: 'Carnet never imports Pages (Pages may import Carnet).' },
  { regex: '^@unlease/pages/(?!sync/copies$)', message: 'Carnet never imports Pages\' package, but the copies\' contract.' },
];

/** Carnet reads Contacts' records (it names the people its notes mention), never its screens. */
const NO_CONTACTS = [{ regex: '^@contacts/(?!data$|app/store/library$)', message: 'Carnet imports only Contacts\' data (@contacts/data, @contacts/app/store/library).' }];

/** The others read Agenda's records (to name the events they mention), never its screens. */
const NO_CALENDAR = [{ regex: '^@calendar/(?!data$|app/store/library$)', message: 'Only Agenda\'s data may be imported (@calendar/data, @calendar/app/store/library).' }];

/** Agenda reads Carnet's and Contacts' records, never their screens, and nothing of Pages' web app. */
const CALENDAR_READS = [
  { regex: '^@notes/(?!data$|app/store/library$)', message: 'Agenda imports only Carnet\'s data (@notes/data, @notes/app/store/library).' },
  { regex: '^@contacts/(?!data$|app/store/library$)', message: 'Agenda imports only Contacts\' data (@contacts/data, @contacts/app/store/library).' },
  { group: ['@pages/*', '@demo/*'], message: 'Agenda imports nothing of Pages\' web app: it reads its records through its own projection.' },
];

/** Contacts reads no other app: its records are its own. */
const NO_OTHER_APPS = [
  { group: ['@notes/*', '@pages/*', '@demo/*'], message: 'Contacts imports no other app (Pages may import Contacts).' },
  { group: ['@unlease/notes/*', '@unlease/pages/*'], message: 'Contacts imports no other app\'s package: only core, design and its own.' },
];

/** Tests draw the whole suite (the shell with its apps): the areas' rules are for the code itself. */
const TESTS = ['**/__tests__/**'];

const restricted = (patterns, files) => ({ files, ignores: TESTS, rules: { 'no-restricted-imports': ['error', { patterns }] } });

export default defineConfig(
  { ignores: ['dist/', 'dist-demo/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  { files: ['public/sw.js', 'root/sw.js'], languageOptions: { globals: globals.serviceworker } },
  tseslint.configs.recommended,
  {
    files: ['shared/**/*.{ts,tsx}', 'notes/src/**/*.{ts,tsx}', 'pages/src/**/*.{ts,tsx}', 'contacts/src/**/*.{ts,tsx}', 'calendar/src/**/*.{ts,tsx}', 'demo/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': ['error', BRAND_LITERAL],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always'],
      // French typography: no-break spaces belong in copy (as in core's formatters).
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },
  // Later entries win for the same file: each area's whole set, its ui's with the database's rule.
  restricted(NO_APPS, ['shared/src/**/*.{ts,tsx}']),
  restricted([...NO_APPS, NO_DB], ['shared/src/ui/**/*.{ts,tsx}']),
  restricted([...NO_PAGES, ...NO_CONTACTS, ...NO_CALENDAR], ['notes/src/**/*.{ts,tsx}']),
  restricted([...NO_PAGES, ...NO_CONTACTS, ...NO_CALENDAR, NO_DB], ['notes/src/ui/**/*.{ts,tsx}']),
  restricted([...NO_OTHER_APPS, ...NO_CALENDAR], ['contacts/src/**/*.{ts,tsx}']),
  restricted([...NO_OTHER_APPS, ...NO_CALENDAR, NO_DB], ['contacts/src/ui/**/*.{ts,tsx}']),
  restricted(NO_CALENDAR, ['pages/src/**/*.{ts,tsx}']),
  restricted([...NO_CALENDAR, NO_DB], ['pages/src/ui/**/*.{ts,tsx}']),
  restricted(CALENDAR_READS, ['calendar/src/**/*.{ts,tsx}']),
  restricted([...CALENDAR_READS, NO_DB], ['calendar/src/ui/**/*.{ts,tsx}']),
  {
    files: ['**/__tests__/**', 'shared/test/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['*.{js,ts}', 'build/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright scripts run in Node and hand callbacks to the page.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
