/**
 * `assets` feeds `npx react-native-asset`, which copies the fonts into the Android assets.
 * Each weight is its own family, so `fontFamily` never relies on Android's weight matching.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
