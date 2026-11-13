/**
 * Test environment for anything that renders: native view libraries are stubbed once here.
 * The SQLite and Reanimated substitutes in `../shared/__mocks__/` are picked up automatically.
 */
require('react-native-gesture-handler/jestSetup');
// As index.js does at start.
require('@unlease/calendar/i18n').addCalendarFrench();

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
jest.mock('../shared/specs/NativeMedia', () => require('../shared/__mocks__/NativeMedia'));
jest.mock('../shared/specs/NativeHaptics', () => require('../shared/__mocks__/NativeHaptics'));
jest.mock('../shared/specs/NativeTextFields', () => require('../shared/__mocks__/NativeTextFields'));
jest.mock('../shared/specs/NativeUnleaseClipboard', () => require('../shared/__mocks__/NativeUnleaseClipboard'));
jest.mock('../shared/specs/NativeMapApps', () => require('../shared/__mocks__/NativeMapApps'));
jest.mock('../shared/specs/NativeSuiteLink', () => require('../shared/__mocks__/NativeSuiteLink'));
jest.mock('../shared/specs/NativeLauncherIcon', () => require('../shared/__mocks__/NativeLauncherIcon'));
jest.mock('../shared/specs/NativeReminders', () => require('../shared/__mocks__/NativeReminders'));
jest.mock('../shared/specs/NativeIntake', () => require('../shared/__mocks__/NativeIntake'));
jest.mock('../shared/specs/OrganicViewNativeComponent', () => require('../shared/__mocks__/OrganicViewNativeComponent'));
jest.mock('../shared/specs/ScrollEdgesViewNativeComponent', () => require('../shared/__mocks__/ScrollEdgesViewNativeComponent'));

jest.mock('react-native-screens', () => {
  const actual = jest.requireActual('react-native-screens');
  return { ...actual, enableScreens: () => {}, enableFreeze: () => {} };
});

jest.spyOn(console, 'warn').mockImplementation(message => {
  if (typeof message === 'string' && /useNativeDriver|Animated/.test(message)) return;
  console.info(message);
});
