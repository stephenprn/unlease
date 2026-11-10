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
          // The projections of the apps Agenda shows (Carnet's reminders, Contacts' birthdays, Pages' dates and mentions): leaves only (borrowGuard).
          '@carnet': '../notes/src',
          '@contacts-app': '../contacts/src',
          '@pages-app': '../pages/src',
          // The suite's phone code (`@shared`) and the packages at the repository root (Metro watches them: metro.config.js).
          ...babelAliases(__dirname),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        resolvePath: borrowGuard(__dirname, ['../notes/src', '../contacts/src', '../pages/src']),
      },
    ],
    // react-native-worklets/plugin powers Reanimated 4 worklets and MUST stay last.
    'react-native-worklets/plugin',
  ],
};
