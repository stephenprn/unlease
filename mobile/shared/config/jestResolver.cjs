/**
 * Jest's resolver for a phone app: a bare import in a file outside the app (the shared code, the
 * packages) resolves from the app's own node_modules, as Metro does (`metroConfig`), never from
 * the web's workspace at the root.
 */
const { bare, outside } = require('./index.cjs');

module.exports = (request, options) => {
  const appDir = options.rootDir;
  if (bare(request) && outside(appDir, options.basedir)) return options.defaultResolver(request, { ...options, basedir: appDir });
  return options.defaultResolver(request, options);
};
