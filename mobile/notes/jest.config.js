module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
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
    '^@unlease/(core|design|notes)/(.*)$': '<rootDir>/../../packages/$1/src/$2',
    // Babel's helpers in the shared packages' files resolve from this app, as Metro resolves them
    // (metro.config.js): the workspace above is not installed in CI.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
};
