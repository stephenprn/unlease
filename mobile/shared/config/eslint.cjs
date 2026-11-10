/**
 * The phone apps' lint, shared: React Native's rules, the suite's (no `Text`, `Touchable*` or
 * `Switch` from react-native, no app name written out, a TurboModule spec only through its adapter)
 * and the layering (`ui -> app -> data/platform -> packages`, docs/ARCHITECTURE.md), for one tree
 * (`mobile/shared`, or an app) whose layers are reached through `aliases` (`@shared` here, `@app`…
 * in an app). The shared tree's own config adds that it imports no app; an app's, its own rules.
 * ESLint 9 is the newest major `@react-native/eslint-config` accepts; its plugins are resolved from
 * the app that runs the lint (`appDir`): the shared tree has no install.
 */
const path = require('path');

const TEST_FILES = ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '__mocks__/**', 'jest.setup.js'];
const TEST_GLOBALS = { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly', require: 'readonly' };

const SPECS_ARE_PRIVATE = { group: ['**/specs/*'], message: 'Import the adapter in platform, not the TurboModule spec.' };

const RN_TEXT_AND_TOUCH = {
  name: 'react-native',
  importNames: ['Text', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Switch'],
  message: 'Use AppText, Tappable and Switch (or SwitchMark) from the components.',
};

/** Case-sensitive on purpose: `carnet.sqlite` and `carnet://capture` are machine strings. */
const BRAND_LITERAL = {
  selector: 'Literal[value=/Carnet|Unlease/], TemplateElement[value.raw=/Carnet|Unlease/]',
  message: 'Use APPS.<id>.name or SUITE_NAME from @unlease/core/apps (or an app\'s APP_NAME) rather than writing a name out.',
};

/**
 * `appDir`: the app running the lint (its node_modules). `layers`: each layer's import aliases in
 * this tree (`{ app: ['@app', '@shared/app'], data: […], ui: […], platform: […] }`). `forbidden`:
 * patterns refused everywhere in the tree (another app's code).
 */
function phoneLint({ appDir, layers, forbidden = [] }) {
  const reactNative = require(require.resolve('@react-native/eslint-config/flat', { paths: [appDir] }));
  const of = name => layers[name].map(alias => `${alias}/*`);
  const restrict = (paths, patterns, specs = true) => ['error', { paths, patterns: [...patterns, ...forbidden, ...(specs ? [SPECS_ARE_PRIVATE] : [])] }];
  return [
    { ignores: ['node_modules/', 'android/', 'ios/', 'coverage/', 'config/'] },
    ...reactNative,
    {
      // RN's two Flow rules for .js call an API ESLint 9 removed, and there is no Flow here.
      files: ['**/*.js', '**/*.cjs'],
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
            { group: [...of('ui'), ...of('app')], message: 'data may not depend on the layers above it.' },
          ],
        ),
      },
    },
    {
      // Through `src/app` only: `src/data` would put synchronous SQL on a render path.
      files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
      ignores: ['src/ui/**/__tests__/**'],
      rules: {
        'no-restricted-imports': restrict([RN_TEXT_AND_TOUCH], [{ group: of('data'), message: 'ui must go through the app layer: add a hook or a store action.' }]),
      },
    },
    {
      files: ['src/platform/**/*.ts'],
      rules: {
        // The adapters are where the specs are imported.
        'no-restricted-imports': restrict([], [{ group: [...of('ui'), ...of('app'), ...of('data')], message: 'platform adapters take arguments, not state.' }], false),
      },
    },
    {
      // AppText is the wrapper: the one place allowed to touch RN's Text.
      files: ['src/ui/components/AppText.tsx'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: TEST_FILES,
      languageOptions: { globals: TEST_GLOBALS },
      rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
    },
  ];
}

module.exports = { phoneLint, TEST_FILES, SHARED: path.resolve(__dirname, '..') };
