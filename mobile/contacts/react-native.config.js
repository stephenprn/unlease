/**
 * `assets` feeds `npx react-native-asset`, which copies the suite's fonts (`mobile/shared/assets`)
 * into the Android assets. Each weight is its own family, so `fontFamily` never relies on Android's
 * weight matching.
 */
module.exports = {
  project: {
    android: {},
  },
  assets: ['../shared/assets/fonts'],
};
