/**
 * Builds every web app, each on its own (`UNLEASE_APP=<app> vite build`), into `dist/notes/`,
 * `dist/pages/`, `dist/contacts/` and `dist/agenda/` (Agenda's, from `calendar/`), then the few files the site's root holds: the response headers and rewrites of a
 * static host (`root/_headers`, `root/_redirects`) and the retired worker of the single app this
 * was before (`root/sw.js`). With `--demo`: the demo (`dist-demo/`, `?demo` always on), whose root
 * sends to Carnet and whose 404 page sends an app's address to that app's page (GitHub Pages has
 * one 404 page for the whole site).
 *
 *   node scripts/build.mjs [--demo] [--base /unlease/]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('..', import.meta.url));
/** Each app's folder, and the path its build lands under (Agenda's addresses are `/agenda/…`). */
const APPS = ['notes', 'pages', 'contacts', 'calendar'];
/** Vite's own command, run by this Node (no `npx`, no shell). */
const VITE = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');

const args = process.argv.slice(2);
const demo = args.includes('--demo');
const at = args.indexOf('--base');
const base = `/${(at >= 0 ? args[at + 1] : process.env.UNLEASE_BASE ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const out = `${WEB}${demo ? 'dist-demo' : 'dist'}/`;

// The whole output afresh: nothing left of an earlier build's layout.
rmSync(out, { recursive: true, force: true });

for (const app of APPS) {
  const run = spawnSync(process.execPath, [VITE, 'build', ...(demo ? ['--mode', 'demo'] : [])], {
    cwd: WEB,
    stdio: 'inherit',
    env: { ...process.env, UNLEASE_APP: app, UNLEASE_BASE: base },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}

if (demo) {
  const page = script => `<!doctype html>\n<meta charset="utf-8">\n<title>Unlease</title>\n<script>${script}</script>\n`;
  writeFileSync(`${out}index.html`, page(`location.replace(${JSON.stringify(`${base}notes/`)} + location.search + location.hash);`));
  // An app's place (`/unlease/pages/<id>`): its app's page, told where to go (`?to=`).
  writeFileSync(
    `${out}404.html`,
    page(
      `var b=${JSON.stringify(base)},r=location.pathname.slice(b.length),m=/^(pages|contacts|agenda)(\\/|$)/.exec(r),a=m?m[1]:'notes';` +
        `location.replace(b+a+'/?to='+encodeURIComponent('/'+r+location.search)+location.hash);`,
    ),
  );
} else {
  for (const file of ['_headers', '_redirects', 'sw.js']) copyFileSync(`${WEB}root/${file}`, `${out}${file}`);
}
