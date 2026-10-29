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
          // The shared packages at the repository root (Metro watches them: metro.config.js).
          '@unlease/core': '../../packages/core/src',
          '@unlease/design': '../../packages/design/src',
          '@unlease/notes': '../../packages/notes/src',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
    // react-native-worklets/plugin powers Reanimated 4 worklets and MUST stay last.
    'react-native-worklets/plugin',
  ],
};
