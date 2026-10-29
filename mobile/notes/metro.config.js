const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const APP = __dirname;

/**
 * The shared packages live at the repository root, outside this app: Metro watches them too.
 * What their files import from outside them (Babel's helpers, once transformed) resolves from this
 * app's node_modules, never from the workspace above it, whose React is the web's.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [path.resolve(APP, '../../packages')],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const outside = !context.originModulePath.startsWith(APP + path.sep);
      const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
      if (outside && bare) return context.resolveRequest({ ...context, originModulePath: path.join(APP, 'index.js') }, moduleName, platform);
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(APP), config);
