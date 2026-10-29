/**
 * The build's one custom plugin: everything the page needs before any script
 * runs, derived from the shared design data.
 *
 *  - `virtual:carnet/tokens.css`: the palette and geometry as CSS custom
 *    properties (see `tokens.ts`), bundled into the main stylesheet so the very
 *    first paint already has the right ground in either theme;
 *  - `<title>`, the theme-colour metas, the manifest and icon links in
 *    `index.html`;
 *  - the manifest and the icons themselves, served in dev and emitted in build.
 *
 * The generators import the shared packages, whose TypeScript the config
 * loader does not read; they are loaded once through Vite's module runner
 * instead, with the same aliases as the app.
 */
import { fileURLToPath } from 'node:url';

import { runnerImport, type Plugin } from 'vite';

import { packageAliases } from './packages.ts';

type Generated = typeof import('./generated.ts');

const TOKENS_ID = 'virtual:carnet/tokens.css';
// A path-like id (no "\0"), so Vite's CSS pipeline treats it as a stylesheet.
const TOKENS_RESOLVED = '/__carnet-tokens.css';

let generated: Promise<Generated> | null = null;

function load(): Promise<Generated> {
  generated ??= runnerImport<Generated>(fileURLToPath(new URL('./generated.ts', import.meta.url)), { configFile: false, logLevel: 'error', resolve: { alias: packageAliases } }).then(result => result.module);
  return generated;
}

const FILES: Record<string, { readonly type: string; readonly body: (g: Generated) => string }> = {
  'manifest.webmanifest': { type: 'application/manifest+json', body: g => g.manifestJson() },
  'icon.svg': { type: 'image/svg+xml', body: g => g.iconSvg() },
  'icon-maskable.svg': { type: 'image/svg+xml', body: g => g.maskableIconSvg() },
  'favicon.svg': { type: 'image/svg+xml', body: g => g.faviconSvg() },
};

export function carnetPlugin(): Plugin {
  // `/`, or the sub-path the demo is served under on GitHub Pages (`--base`).
  let base = '/';
  return {
    name: 'carnet',
    configResolved(config) {
      base = config.base;
    },
    resolveId(id) {
      return id === TOKENS_ID ? TOKENS_RESOLVED : null;
    },
    async load(id) {
      return id === TOKENS_RESOLVED ? (await load()).tokensCss() : null;
    },
    async transformIndexHtml() {
      const g = await load();
      const colors = g.themeColors();
      return [
        { tag: 'title', children: g.APP_NAME, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: colors.light, media: '(prefers-color-scheme: light)' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: colors.dark, media: '(prefers-color-scheme: dark)' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: g.APP_NAME }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' }, injectTo: 'head' },
      ];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = (request.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
        const file = FILES[name];
        if (!file) {
          next();
          return;
        }
        load().then(
          g => {
            response.setHeader('Content-Type', file.type);
            response.end(file.body(g));
          },
          error => next(error),
        );
      });
    },
    async generateBundle() {
      const g = await load();
      for (const [fileName, file] of Object.entries(FILES)) {
        this.emitFile({ type: 'asset', fileName, source: file.body(g) });
      }
    },
  };
}
