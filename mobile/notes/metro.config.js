const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { metroConfig } = require('../shared/config/index.cjs');

/**
 * The suite's phone code (`mobile/shared`), the packages at the repository root and Contacts'
 * projection (`@contacts-app/*`, `mobile/contacts/src`, to name the people a note mentions) live
 * outside this app: Metro watches them too, and what their files import from outside them resolves
 * from this app's node_modules, never from Contacts' or from the workspace above it, whose React is the web's.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const shared = metroConfig(__dirname);
module.exports = mergeConfig(getDefaultConfig(__dirname), { ...shared, watchFolders: [...shared.watchFolders, path.resolve(__dirname, '../contacts/src')] });
