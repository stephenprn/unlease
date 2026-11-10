const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { metroConfig } = require('../shared/config/index.cjs');

/**
 * The suite's phone code (`mobile/shared`) and the packages at the repository root live outside
 * this app: Metro watches them too, and what their files import from outside them resolves from
 * this app's node_modules, never from the workspace above, whose React is the web's.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
module.exports = mergeConfig(getDefaultConfig(__dirname), metroConfig(__dirname));
