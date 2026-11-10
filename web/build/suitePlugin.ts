/**
 * The build's one custom plugin: everything a web app's page needs before any script runs,
 * derived from the shared design data.
 *
 *  - `virtual:unlease/tokens.css`: the palette and geometry as CSS custom
 *    properties (see `tokens.ts`), bundled into the main stylesheet so the very
 *    first paint already has the right ground in either theme;
 *  - `<title>`, the theme-colour metas, the manifest and icon links in each
 *    app's `index.html`;
 *  - each app's manifest and icons, served in dev and emitted in its build.
 *
 * Each app is its own web app (`notes/index.html`, `pages/index.html`, `contacts/index.html`), built
 * on its own under its own path (`/notes/`, `/pages/`, `/contacts/`). The dev server serves them all at once, as the server does, so a link
 * from one into the other works there too: an app's address that is no file gets its page, and `/`
 * goes to Carnet.
 *
 * The generators import the shared packages, whose TypeScript the config
 * loader does not read; they are loaded once through Vite's module runner
 * instead, with the same aliases as the app.
 */
import { fileURLToPath } from 'node:url';

import { runnerImport, type Plugin } from 'vite';

import { WEB_PATHS, type WebApp } from './paths.ts';
import { packageAliases } from './packages.ts';

type Generated = typeof import('./generated.ts');

const TOKENS_ID = 'virtual:unlease/tokens.css';
// A path-like id (no "\0"), so Vite's CSS pipeline treats it as a stylesheet.
const TOKENS_RESOLVED = '/__unlease-tokens.css';

/** Every app with a web app of its own, in the suite's order. */
export const WEB_APPS: readonly WebApp[] = ['notes', 'pages', 'contacts', 'calendar'];

let generated: Promise<Generated> | null = null;

function load(): Promise<Generated> {
  generated ??= runnerImport<Generated>(fileURLToPath(new URL('./generated.ts', import.meta.url)), { configFile: false, logLevel: 'error', resolve: { alias: packageAliases } }).then(result => result.module);
  return generated;
}

/** The files drawn from the shared data, beside an app's page: its manifest, its install icons, its tab icon. */
function files(g: Generated, app: WebApp): Record<string, { readonly type: string; readonly body: string }> {
  const svg = (body: string) => ({ type: 'image/svg+xml', body });
  return {
    'manifest.webmanifest': { type: 'application/manifest+json', body: g.manifestJson(app) },
    'icon.svg': svg(g.iconSvg(app)),
    'icon-maskable.svg': svg(g.maskableIconSvg(app)),
    'favicon.svg': svg(g.faviconSvg(app)),
  };
}

/** The app an address belongs to (`/notes/…`), and what follows its path. */
function appOf(path: string): { readonly app: WebApp; readonly rest: string } | null {
  const match = /^\/([a-z]+)(\/.*)?$/.exec(path);
  const app = match ? WEB_APPS.find(each => WEB_PATHS[each] === match[1]) : undefined;
  return match && app ? { app, rest: match[2] ?? '' } : null;
}

/** The app whose folder a dev server's file is in (`/calendar/index.html`, once a place's address is read as its page). */
function folderOf(path: string): WebApp | null {
  const folder = /^\/([a-z]+)\//.exec(path)?.[1];
  return WEB_APPS.find(each => each === folder) ?? null;
}

/**
 * `app`: the app this build makes (its page is `index.html` at the root, served under its own path);
 * null on the dev server, which serves every app's.
 */
export function suitePlugin(app: WebApp | null): Plugin {
  // `/notes/` once built (`/unlease/notes/` for the demo on GitHub Pages); `/` on the dev server.
  let base = '/';

  /**
   * The app's title, theme colours, manifest and tab icon in its page. On the dev server, the page's
   * own script is named from the server's root: a place's address (`/notes/note/…`) is no folder.
   */
  async function transformPage(html: string, path: string) {
    const g = await load();
    const colors = g.themeColors();
    // Built, the app's page is the root's; on the dev server, the folder says whose it is.
    const own = app ?? appOf(path)?.app ?? folderOf(path) ?? 'notes';
    const at = app ? base : `/${WEB_PATHS[own]}/`;
    const name = g.webAppName(own);
    return {
      html: app ? html : html.replace('src="./src/', `src="/${own}/src/`),
      tags: [
        { tag: 'title', children: name, injectTo: 'head' as const },
        { tag: 'meta', attrs: { name: 'description', content: g.webAppTagline(own) }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { name: 'theme-color', content: colors.light, media: '(prefers-color-scheme: light)' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { name: 'theme-color', content: colors.dark, media: '(prefers-color-scheme: dark)' }, injectTo: 'head' as const },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: name }, injectTo: 'head' as const },
        { tag: 'link', attrs: { rel: 'manifest', href: `${at}manifest.webmanifest` }, injectTo: 'head' as const },
        { tag: 'link', attrs: { rel: 'icon', href: `${at}favicon.svg`, type: 'image/svg+xml' }, injectTo: 'head' as const },
      ],
    };
  }

  return {
    name: 'unlease',
    configResolved(config) {
      base = config.base;
    },
    resolveId(id) {
      return id === TOKENS_ID ? TOKENS_RESOLVED : null;
    },
    async load(id) {
      return id === TOKENS_RESOLVED ? (await load()).tokensCss() : null;
    },
    transformIndexHtml: {
      order: 'pre',
      handler: async (html, context) => transformPage(html, context.path),
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path = '/', query = ''] = (request.url ?? '/').split('?');
        if (path === '/') {
          response.statusCode = 302;
          response.setHeader('Location', `/notes${query ? `?${query}` : ''}`);
          response.end();
          return;
        }
        const place = appOf(path);
        if (!place) return next();
        const name = place.rest.replace(/^\//, '');
        if (/^(manifest\.webmanifest|icon\.svg|icon-maskable\.svg|favicon\.svg)$/.test(name)) {
          load().then(
            g => {
              const file = files(g, place.app)[name]!;
              response.setHeader('Content-Type', file.type);
              response.end(file.body);
            },
            error => next(error),
          );
          return;
        }
        // A place of the app (`/notes/note/…`), not one of its files: its page, whose router reads the address.
        if (!/\.[a-z0-9]+$/i.test(name) && !name.startsWith('src/') && !name.startsWith('@')) request.url = `/${place.app}/index.html${query ? `?${query}` : ''}`;
        next();
      });
    },
    async generateBundle() {
      if (!app) return;
      const g = await load();
      for (const [fileName, file] of Object.entries(files(g, app))) {
        this.emitFile({ type: 'asset', fileName, source: file.body });
      }
    },
  };
}
