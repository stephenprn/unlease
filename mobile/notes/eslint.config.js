/**
 * Enforces the app's layering (docs/ARCHITECTURE.md). The shared packages it imports
 * (`@unlease/*`, at the repository root) are linted by the root config.
 * Flat config: ESLint 9 is the newest major `@react-native/eslint-config` accepts.
 */
const reactNative = require('@react-native/eslint-config/flat');

const SPECS_ARE_PRIVATE = {
  group: ['**/specs/*'],
  message: 'Import the adapter in @platform, not the TurboModule spec.',
};

const RN_TEXT_AND_TOUCH = {
  name: 'react-native',
  importNames: ['Text', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Switch'],
  message: 'Use AppText, Tappable and Switch (or SwitchMark) from @ui/components.',
};

/** Case-sensitive on purpose: `carnet.sqlite` and `carnet://capture` are machine strings. */
const BRAND_LITERAL = {
  selector: 'Literal[value=/Carnet|Unlease/], TemplateElement[value.raw=/Carnet|Unlease/]',
  message: 'Use APP_NAME from @unlease/notes/brand (or SUITE_NAME from @unlease/core/apps) rather than writing a name out.',
};

const restrict = (paths, patterns) => [
  'error',
  { paths, patterns: [...patterns, SPECS_ARE_PRIVATE] },
];

module.exports = [
  { ignores: ['node_modules/', 'android/', 'ios/', 'coverage/'] },
  ...reactNative,
  {
    // RN's two Flow rules for .js call an API ESLint 9 removed, and there is no Flow here.
    files: ['**/*.js'],
    rules: { 'ft-flow/define-flow-type': 'off', 'ft-flow/use-flow-type': 'off' },
  },
  {
    rules: {
      'no-restricted-syntax': ['error', BRAND_LITERAL],
      'no-restricted-imports': restrict([RN_TEXT_AND_TOUCH], []),
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict(
        [],
        [
          { group: ['react-native', 'react-native/*'], message: 'data has no UI concerns.' },
          { group: ['@ui/*', '@app/*'], message: 'data may not depend on the layers above it.' },
        ],
      ),
    },
  },
  {
    // Through `src/app` only: `src/data` would put synchronous SQL on a render path.
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    ignores: ['src/ui/**/__tests__/**'],
    rules: {
      'no-restricted-imports': restrict(
        [RN_TEXT_AND_TOUCH],
        [{ group: ['@data/*'], message: 'ui must go through @app: add a hook or a store action.' }],
      ),
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@ui/*', '@app/*', '@data/*'], message: 'platform adapters take arguments, not state.' }] },
      ],
    },
  },
  {
    // AppText is the wrapper: the one place allowed to touch RN's Text.
    files: ['src/ui/components/AppText.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '__mocks__/**', 'jest.setup.js'],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly', require: 'readonly' },
    },
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
];
