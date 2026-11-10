/**
 * What every phone app of the suite tells its bundler and its test runner about the shared code:
 * this folder's JavaScript (`@shared/*`) and the packages at the repository root (`@unlease/*`).
 * Neither has an install of its own: a bare import in their files (React, React Native, Babel's
 * helpers once transformed) resolves from the app being built, never from the web's workspace at
 * the root. Each app's tsconfig lists the same paths (TypeScript cannot read this file).
 */
const path = require('path');

const SHARED = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(SHARED, '../..');
const PACKAGES = path.join(REPOSITORY, 'packages');
/** The suite's packages an app may import, in their order (`core <- design <- notes, contacts <- calendar <- pages`). */
const PACKAGE_NAMES = ['core', 'design', 'notes', 'contacts', 'calendar', 'pages'];

/** Babel's module-resolver aliases, relative to the app (`root: ['./']`). */
function babelAliases(appDir) {
  const rel = target => {
    const out = path.relative(appDir, target);
    return out.startsWith('.') ? out : `./${out}`;
  };
  const aliases = { '@shared': rel(path.join(SHARED, 'src')) };
  for (const name of PACKAGE_NAMES) aliases[`@unlease/${name}`] = rel(path.join(PACKAGES, name, 'src'));
  return aliases;
}

/** An app's own layers, as its files import them: never to be met in another app's file it borrows (they would resolve to the borrowing app's). */
const APP_LAYERS = /^@(app|data|ui|platform)\//;

/**
 * Babel's `resolvePath` for an app that borrows files from a sibling app (Pages shows Carnet's link
 * rows and drawings: `@carnet/*`). A borrowed file reached through its own app's layers
 * (`@app/store/libraryStore`) would silently resolve to the borrowing app's: refused here, so
 * every borrowed file stays a leaf (the shared code, the packages, its own folder).
 */
function borrowGuard(appDir, borrowed) {
  const { resolvePath } = require(require.resolve('babel-plugin-module-resolver', { paths: [appDir] }));
  const roots = borrowed.map(dir => path.resolve(appDir, dir) + path.sep);
  return (source, file, options) => {
    if (APP_LAYERS.test(source) && roots.some(root => file.startsWith(root))) {
      throw new Error(`${path.relative(REPOSITORY, file)} imports ${source}: a file another app borrows may import only the shared code, the packages and its own folder.`);
    }
    return resolvePath(source, file, options);
  };
}

/** Jest's moduleNameMapper entries for the same aliases. */
function jestModuleNameMapper() {
  return {
    '^@shared/(.*)$': `${path.join(SHARED, 'src')}/$1`,
    [`^@unlease/(${PACKAGE_NAMES.join('|')})/(.*)$`]: `${PACKAGES}/$1/src/$2`,
  };
}

/** Whether a file lies outside the app (the shared code, the packages): its bare imports resolve from the app. */
const outside = (appDir, file) => !file.startsWith(appDir + path.sep);
const bare = name => !name.startsWith('.') && !path.isAbsolute(name);

/**
 * Metro names an image outside the app by its way there from the app
 * (`/assets/../shared/assets/textures/grain.png`), and the phone's HTTP client folds the `..` away
 * before asking (`/shared/assets/textures/grain.png`), an address Metro does not serve: the shared
 * images (the paper's and the ground's grain) never load. Such an address goes back under
 * `/assets/`, its way up escaped (`..%2Fshared/…`), as Metro reads it. Only a build that loads its
 * JavaScript from Metro asks it for images; a release carries them in its resources.
 */
function assetsOutsideApp(appDir, folders) {
  const ways = folders.map(folder => path.relative(appDir, folder).split(path.sep).join('/'));
  const routes = ways.map(way => ({ folded: `${path.posix.normalize(`/assets/${way}`)}/`, escaped: `/assets/${way.replace(/\//g, '%2F')}/` }));
  return url => {
    const at = url.search(/[?#]/);
    const pathname = at < 0 ? url : url.slice(0, at);
    const folded = path.posix.normalize(pathname);
    const route = routes.find(each => folded.startsWith(each.folded));
    return route ? route.escaped + folded.slice(route.folded.length) + (at < 0 ? '' : url.slice(at)) : url;
  };
}

/** Metro's part: watch the shared code and the packages, resolve their bare imports from the app, serve their images. */
function metroConfig(appDir) {
  return {
    server: { rewriteRequestUrl: assetsOutsideApp(appDir, [SHARED, PACKAGES]) },
    watchFolders: [SHARED, PACKAGES],
    resolver: {
      resolveRequest: (context, moduleName, platform) => {
        if (outside(appDir, context.originModulePath) && bare(moduleName)) {
          return context.resolveRequest({ ...context, originModulePath: path.join(appDir, 'index.js') }, moduleName, platform);
        }
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

module.exports = { SHARED, PACKAGES, PACKAGE_NAMES, babelAliases, borrowGuard, jestModuleNameMapper, metroConfig, outside, bare };
