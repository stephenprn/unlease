const { jestModuleNameMapper } = require('../shared/config/index.cjs');

module.exports = {
  preset: '@react-native/jest-preset',
  // The suite's phone code is tested here too: its own tests, with this app's install.
  roots: ['<rootDir>', '<rootDir>/../shared'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  // A bare import in the shared code, the packages or the borrowed projections resolves from this app, as Metro does.
  resolver: '<rootDir>/../shared/config/jestResolver.cjs',
  transformIgnorePatterns: [
    // These ship untranspiled ESM/Flow and must go through babel.
    'node_modules/(?!(?:@react-native|react-native|@react-navigation|react-native-.*|@op-engineering|@notifee)/)',
  ],
  // Mirror the babel/tsconfig aliases so tests import the way the app does.
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@platform/(.*)$': '<rootDir>/src/platform/$1',
    '^@carnet/(.*)$': '<rootDir>/../notes/src/$1',
    '^@contacts-app/(.*)$': '<rootDir>/../contacts/src/$1',
    '^@pages-app/(.*)$': '<rootDir>/../pages/src/$1',
    ...jestModuleNameMapper(),
    // Babel's helpers in the shared files resolve from this app, as Metro resolves them
    // (metro.config.js): the workspace above is not installed in CI.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx', '<rootDir>/../shared/src/**/*.test.ts', '<rootDir>/../shared/src/**/*.test.tsx'],
};
