/**
 * Test environment for anything that renders: native view libraries are stubbed once here.
 * The SQLite and Notifee substitutes in `__mocks__/` are picked up automatically.
 */
require('react-native-gesture-handler/jestSetup');
// As index.js does at start.
require('@unlease/notes/i18n').addNotesEnglish();

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 32, right: 0, bottom: 24, left: 0 };
  const { View } = require('react-native');
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 412, height: 915 }),
  };
});

// App-local TurboModules are not node modules: a root __mocks__ entry is not picked up.
jest.mock('./specs/NativeIntake', () => require('./__mocks__/NativeIntake'));
jest.mock('./specs/NativeMedia', () => require('./__mocks__/NativeMedia'));
jest.mock('./specs/NativeHaptics', () => require('./__mocks__/NativeHaptics'));
jest.mock('./specs/OrganicViewNativeComponent', () => require('./__mocks__/OrganicViewNativeComponent'));

jest.mock('react-native-screens', () => {
  const actual = jest.requireActual('react-native-screens');
  return { ...actual, enableScreens: () => {}, enableFreeze: () => {} };
});

jest.spyOn(console, 'warn').mockImplementation(message => {
  if (typeof message === 'string' && /useNativeDriver|Animated/.test(message)) return;
  console.info(message);
});
