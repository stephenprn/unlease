const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { metroConfig } = require('../shared/config/index.cjs');

/**
 * The suite's phone code (`mobile/shared`), the packages at the repository root and the projections
 * Agenda borrows (Carnet's `@carnet/*`, Contacts' `@contacts-app/*`, Pages' `@pages-app/*`: what the
 * calendar shows of them) live outside this app: Metro watches them too, and what their files import
 * from outside them resolves from this app's node_modules, never from the workspace above.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const shared = metroConfig(__dirname);
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  ...shared,
  watchFolders: [...shared.watchFolders, path.resolve(__dirname, '../notes/src'), path.resolve(__dirname, '../contacts/src'), path.resolve(__dirname, '../pages/src')],
});
