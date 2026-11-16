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
          // The projection of the app Clock shows (Agenda's events, as an alarm rings and the evening before): a leaf only (borrowGuard).
          '@calendar-app': '../calendar/src',
          // The suite's phone code (`@shared`) and the packages at the repository root (Metro watches them: metro.config.js).
          ...babelAliases(__dirname),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        resolvePath: borrowGuard(__dirname, ['../calendar/src']),
      },
    ],
    // react-native-worklets/plugin powers Reanimated 4 worklets and MUST stay last.
    'react-native-worklets/plugin',
  ],
};
