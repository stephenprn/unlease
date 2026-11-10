const { babelAliases, borrowGuard } = require('../shared/config/index.cjs');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@app': './src/app',
          '@data': './src/data',
          '@ui': './src/ui',
          '@platform': './src/platform',
          // Contacts' projection, to name the people a note mentions: a leaf only (borrowGuard).
          '@contacts-app': '../contacts/src',
          // The suite's phone code (`@shared`) and the packages at the repository root (Metro watches them: metro.config.js).
          ...babelAliases(__dirname),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        resolvePath: borrowGuard(__dirname, ['../contacts/src']),
      },
    ],
    // react-native-worklets/plugin powers Reanimated 4 worklets and MUST stay last.
    'react-native-worklets/plugin',
  ],
};
