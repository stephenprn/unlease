/**
 * The README's pictures, into `docs/images/` (replaced whole), each by day and by night:
 *  - screens of the dev-only demo (`?demo`), in English at 1440×900: each app's home (the banner, the
 *    four together) and a closer look at each, cut to what it shows and taken at twice the size;
 *  - pictures drawn in the apps' own materials (`readme/pictures.mjs`): the banner and the close-ups laid
 *    on the ground, how the apps link, how Unlease runs, what leaves the server, the install;
 *  - the apps' marks, and the four in a row (the README's header).
 * Run it again when a screen or a fact they show changes.
 *
 *   npm run readme-images                                  # starts Vite itself
 *   npm run readme-images -- links run                     # only those drawn pictures, the rest kept
 *   CHROMIUM_PATH=/path/to/chromium npm run readme-images   # another Chromium than Playwright's own
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { bannerPage, closeupPage, installPage, linksPage, privacyPage, runPage, WIDTH } from './readme/pictures.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../../docs/images/', import.meta.url));
const QUALITY = 86;
const SCHEMES = ['light', 'dark'];

/** The banner's screens: each app's home. */
const HOMES = { 'carnet-board': '/notes', 'pages-home': '/pages', 'agenda-week': '/agenda/week', 'contacts-list': '/contacts' };
/**
 * A closer look at each app, by file name: where it is in the demo, the part of the screen it shows (cut
 * on its own edges: a heading, a grid line, a sheet), the window's height when it needs more, and
 * what it leaves out: a collection's ghost emblem spills past any cut narrow enough to read.
 */
const CLOSEUPS = {
  carnet: { path: '/notes/line/line-mode', clip: { x: 280, y: 84, width: 850, height: 570 }, hide: '[class*="_ghost_"]' },
  pages: { path: '/pages/demo-page-lisbonne', clip: { x: 465, y: 626, width: 775, height: 540 }, height: 1200 },
  agenda: { path: '/agenda/week', clip: { x: 288, y: 128, width: 823, height: 502 } },
  contacts: { path: '/contacts/contact/demo-contact-lea', clip: { x: 288, y: 70, width: 720, height: 650 } },
};
/** The drawn pictures, by file name. */
const PICTURES = { links: linksPage, run: runPage, privacy: privacyPage, install: installPage };

/**
 * A screen of the demo as a JPEG (the paper's grain makes a PNG ten times heavier), whole or its `clip`,
 * at `scale`, without what `hide` names. The interface in English on a French device: the demo's people
 * are French, and a device's region is what their numbers are read in.
 */
async function capture(browser, base, path, scheme, { clip, scale = 1, height = 900, hide } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: scale, colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}${path}?demo=1&lang=en`);
  await page.waitForTimeout(2_500);
  if (hide) await page.addStyleTag({ content: `${hide} { visibility: hidden !important; }` });
  const shot = await page.screenshot({ type: 'jpeg', quality: QUALITY, clip });
  await context.close();
  if (errors.length > 0) throw new Error(`${path}: ${errors.join(' | ')}`);
  return shot;
}

/** A drawn picture at twice its size, on a page of its own address so its font and grains load from it. */
async function draw(browser, html) {
  const files = {
    '/signika.woff2': [`${WEB}public/fonts/signika-variable.woff2`, 'font/woff2'],
    '/grain.png': [`${WEB}public/grain.png`, 'image/png'],
    '/ground-grain.png': [`${WEB}public/ground-grain.png`, 'image/png'],
  };
  const context = await browser.newContext({ viewport: { width: WIDTH, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://readme.unlease/**', route => {
    const file = files[new URL(route.request().url()).pathname];
    return file ? route.fulfill({ body: readFileSync(file[0]), contentType: file[1] }) : route.fulfill({ body: html, contentType: 'text/html' });
  });
  await page.goto('https://readme.unlease/');
  await page.waitForFunction(() => window.drawn === true);
  const shot = await page.locator('main').screenshot({ type: 'jpeg', quality: QUALITY });
  await context.close();
  if (errors.length > 0) throw new Error(errors.join(' | '));
  return shot;
}

async function main() {
  const server = await createServer({ configFile: `${WEB}vite.config.ts`, server: { port: 5197, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, '');
  const brand = await server.ssrLoadModule('/build/brand.ts');
  const design = {
    ...(await server.ssrLoadModule('@unlease/design/palette')),
    ...(await server.ssrLoadModule('@unlease/design/glyphs')),
    ...(await server.ssrLoadModule('@unlease/design/pebbles')),
    ...(await server.ssrLoadModule('@unlease/design/emblems')),
  };
  const { APPS } = await server.ssrLoadModule('@unlease/core/apps');
  const only = process.argv.slice(2);
  const unknown = only.filter(name => !(name in PICTURES));
  if (unknown.length > 0) throw new Error(`No such picture: ${unknown.join(', ')} (${Object.keys(PICTURES).join(', ')})`);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    if (only.length > 0) {
      for (const scheme of SCHEMES) for (const name of only) writeFileSync(`${OUT}${name}-${scheme}.jpg`, await draw(browser, PICTURES[name](design, brand, scheme)));
      console.log(`docs/images/: ${only.map(name => `${name}-light.jpg, ${name}-dark.jpg`).join(', ')}`);
      return;
    }
    // The pictures afresh: none left of an earlier set.
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(`${OUT}marks`, { recursive: true });
    const shots = {};
    for (const scheme of SCHEMES) {
      for (const [name, path] of Object.entries(HOMES)) shots[`${name}-${scheme}`] = await capture(browser, base, path, scheme);
      writeFileSync(`${OUT}banner-${scheme}.jpg`, await draw(browser, bannerPage(design, brand, scheme, shots)));
      for (const [name, { path, clip, height, hide }] of Object.entries(CLOSEUPS)) {
        const shot = await capture(browser, base, path, scheme, { clip, height, hide, scale: 2 });
        writeFileSync(`${OUT}${name}-${scheme}.jpg`, await draw(browser, closeupPage(design, brand, scheme, shot, clip)));
      }
      for (const [name, page] of Object.entries(PICTURES)) writeFileSync(`${OUT}${name}-${scheme}.jpg`, await draw(browser, page(design, brand, scheme)));
    }

    // Each app's mark, and the four in a row (the README's header).
    const apps = ['notes', 'pages', 'calendar', 'contacts'];
    const inner = svg => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    for (const app of apps) writeFileSync(`${OUT}marks/${APPS[app].slug}.svg`, `${brand.iconSvg(app)}\n`);
    const row = apps.map((app, at) => `<g transform="translate(${at * 600} 0)">${inner(brand.iconSvg(app))}</g>`).join('');
    writeFileSync(`${OUT}marks.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2312 512">${row}</svg>\n`);
    console.log(`docs/images/: ${readdirSync(OUT).join(', ')}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
