/**
 * Lint for the web app. Two house rules ride on top of the recommended sets:
 *
 *  - the app's name is `APP_NAME` from `@unlease/notes/brand` and nothing else (the same
 *    rule the phone enforces), so a rename stays a one-line change;
 *  - `src/ui` reaches storage only through `src/app`, so a component never
 *    couples itself to IndexedDB.
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
  message: 'Use APP_NAME from @unlease/notes/brand (or SUITE_NAME from @unlease/core/apps) rather than writing a name out.',
};

export default defineConfig(
  { ignores: ['dist/', 'dist-demo/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
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
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/app/db/*', '**/app/db'], message: 'ui goes through src/app (a hook or an action), never to IndexedDB.' }],
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**', 'src/test/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['*.{js,ts}', 'build/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright scripts run in Node and hand callbacks to the page.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
