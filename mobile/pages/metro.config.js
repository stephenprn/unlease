const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { metroConfig } = require('../shared/config/index.cjs');

/**
 * The suite's phone code (`mobile/shared`), the packages at the repository root and the pieces of
 * Carnet that Pages shows (`@carnet/*`, `mobile/notes/src`) and Contacts' projection (`@contacts-app/*`,
 * `mobile/contacts/src`, to name the people pages mention) live outside this app: Metro watches
 * them too, and what their files import from outside them resolves from this app's node_modules,
 * never from Carnet's or from the workspace above, whose React is the web's.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const shared = metroConfig(__dirname);
module.exports = mergeConfig(getDefaultConfig(__dirname), { ...shared, watchFolders: [...shared.watchFolders, path.resolve(__dirname, '../notes/src'), path.resolve(__dirname, '../contacts/src')] });
