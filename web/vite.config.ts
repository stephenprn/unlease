/**
 * The web apps, one config: Carnet (`notes/`), Pages (`pages/`), Contacts (`contacts/`) and Agenda (`calendar/`, served at `/agenda/`), each its
 * own page, build, manifest and service worker, on the shell they share (`shared/`).
 *
 *  - `vite` (dev): every app on one server, at `/notes/`, `/pages/`, `/contacts/`, `/agenda/`, as the server serves them;
 *  - `UNLEASE_APP=<app> vite build`: one app, from its folder, into `dist/<app>/`, under `/<app>/`
 *    (`scripts/build.mjs` builds each, and the demo with `--demo`); `UNLEASE_BASE` is the path the
 *    whole is served under (`/unlease/` for the demo on GitHub Pages), `/` by default;
 *  - `vitest`: one project per app, each with its own app installed (`shared/test/setup.ts`); the
 *    shell's tests run with Carnet's.
 */
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { webPath, type WebApp } from './build/paths.ts';
import { suitePlugin, WEB_APPS } from './build/suitePlugin.ts';
import { appAliases, packageAliases, PACKAGES } from './build/packages.ts';

const web = fileURLToPath(new URL('.', import.meta.url));

/** The path the apps are served under, with its slashes: `/`, or `/unlease/` for the demo. */
function suiteBase(): string {
  const base = process.env.UNLEASE_BASE ?? '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
}

function builtApp(): WebApp | null {
  const app = process.env.UNLEASE_APP;
  if (!app) return null;
  if (!(WEB_APPS as readonly string[]).includes(app)) throw new Error(`UNLEASE_APP: one of ${WEB_APPS.join(', ')}, not "${app}"`);
  return app as WebApp;
}

const TEST_SETUP = ['shared/test/setup.ts'];

export default defineConfig(({ command, mode }) => {
  const app = command === 'build' ? builtApp() : null;
  if (command === 'build' && !app) throw new Error('Build one app at a time (UNLEASE_APP=notes|pages|contacts|calendar), or all with `npm run build`.');
  const base = suiteBase();
  return {
    root: app ? `${web}${app}` : web,
    base: app ? `${base}${webPath(app)}/` : '/',
    publicDir: `${web}public`,
    appType: 'mpa',
    plugins: [react(), suitePlugin(app)],
    resolve: { alias: [...packageAliases, ...appAliases] },
    // The router's base: the browser's address less it is the app's path (`/notes/…`).
    define: { __SUITE_BASE__: JSON.stringify(base.replace(/\/$/, '')) },
    server: { fs: { allow: [web, PACKAGES] } },
    build: {
      target: 'es2023',
      outDir: app ? `${web}${mode === 'demo' ? 'dist-demo' : 'dist'}/${webPath(app)}` : undefined,
      emptyOutDir: true,
    },
    test: {
      projects: WEB_APPS.map(each => ({
        extends: true,
        test: {
          name: each,
          root: web,
          environment: 'jsdom',
          // The shell's tests run with Carnet.
          include: each === 'notes' ? ['notes/**/*.test.{ts,tsx}', 'shared/**/*.test.{ts,tsx}', 'demo/**/*.test.{ts,tsx}'] : [`${each}/**/*.test.{ts,tsx}`],
          setupFiles: TEST_SETUP,
          env: { UNLEASE_TEST_APP: each },
          css: { modules: { classNameStrategy: 'non-scoped' } },
          testTimeout: 15_000,
        },
      })),
    },
  };
});
