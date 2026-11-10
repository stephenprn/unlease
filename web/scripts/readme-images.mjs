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
/** The drawn pictures, by file name. */
const PICTURES = { links: linksPage, run: runPage, privacy: privacyPage, install: installPage };
/** The ground left round a close-up's content on every side, in CSS pixels. */
const MARGIN = 40;
/**
 * A closer look at each app, by file name: where it is in the demo, the window it is seen in, the
 * elements it shows (`roots`: the picture is cut round what they paint, `MARGIN` on every side) and
 * what `prepare` changes first for the cut to have its margin: the calendar ends above the window's
 * foot, the page keeps room on its right, Carnet's watermark goes.
 */
const CLOSEUPS = {
  carnet: {
    path: '/notes/line/line-mode',
    // The collection's emblem as a watermark spills past the window: a close-up leaves it out.
    prepare: page =>
      page.evaluate(() => {
        for (const ghost of document.querySelectorAll('main header svg[aria-hidden="true"]')) if (ghost.getBoundingClientRect().width > 300) ghost.style.visibility = 'hidden';
      }),
    roots: page => [page.locator('main header').first(), page.locator('main form').first(), ...[0, 1, 2, 3].map(at => page.locator('main ul > li').nth(at))],
  },
  pages: {
    path: '/pages/demo-page-lisbonne',
    size: { width: 1440, height: 1300 },
    roots: page => [page.getByText('Getting ready', { exact: true }).last(), page.locator('table').first(), page.getByRole('button', { name: 'New row' }).first()],
  },
  agenda: {
    path: '/agenda/week',
    size: { width: 1200, height: 860 },
    prepare: page =>
      page.evaluate(() => {
        document.documentElement.style.paddingRight = '16px';
        const frame = document.querySelector('main [role="toolbar"] + *');
        if (frame instanceof HTMLElement) Object.assign(frame.style, { flex: 'none', height: '560px' });
      }),
    roots: page => [page.getByRole('toolbar').first(), page.locator('main [role="toolbar"] + *').first()],
  },
  contacts: {
    path: '/contacts/contact/demo-contact-lea',
    roots: page => [page.locator('main header').first(), page.locator('main nav').first(), page.locator('main section').nth(0), page.locator('main section').nth(1)],
  },
};

/**
 * What `roots` paint, in the page: the box round their words, pictures, fields and every surface with a
 * colour, an edge or a shadow (the ground a bar paints aside), within the roots themselves (a scrolled list
 * paints past them, unseen).
 */
function painted(roots) {
  let box = null;
  const add = rect => {
    if (rect.width < 1 || rect.height < 1) return;
    box = box ? { left: Math.min(box.left, rect.left), top: Math.min(box.top, rect.top), right: Math.max(box.right, rect.right), bottom: Math.max(box.bottom, rect.bottom) } : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  };
  const seen = element => {
    for (let at = element; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    }
    return true;
  };
  let bounds = null;
  for (const root of roots) {
    const own = root.getBoundingClientRect();
    bounds = bounds ? { left: Math.min(bounds.left, own.left), top: Math.min(bounds.top, own.top), right: Math.max(bounds.right, own.right), bottom: Math.max(bounds.bottom, own.bottom) } : { left: own.left, top: own.top, right: own.right, bottom: own.bottom };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent.trim() || !seen(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) add(rect);
        continue;
      }
      if (!seen(node)) continue;
      const style = getComputedStyle(node);
      // The ground a bar paints (fixed to the window, as the page's) is not a surface of its own.
      const ground = style.backgroundAttachment.includes('fixed');
      const surface = (!ground && (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none')) || style.boxShadow !== 'none' || (style.borderTopStyle !== 'none' && style.borderTopWidth !== '0px');
      if (surface || /^(img|svg|canvas|input|textarea|video)$/i.test(node.tagName)) add(node.getBoundingClientRect());
    }
  }
  return {
    left: Math.max(box.left, bounds.left),
    top: Math.max(box.top, bounds.top),
    right: Math.min(box.right, bounds.right),
    bottom: Math.min(box.bottom, bounds.bottom),
  };
}

/**
 * Hides, in place (nothing moves), every element wholly outside `box`: the app's bars, a neighbour above
 * or below, so a close-up's margin is the ground alone. What lies within it stays, between its roots too.
 */
function hideOutside(box) {
  for (const element of document.body.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= box.top || rect.top >= box.bottom || rect.right <= box.left || rect.left >= box.right) element.style.visibility = 'hidden';
  }
}

/** A close-up's cut: what its roots paint and `MARGIN` round it, what lies outside hidden. */
async function closeupClip(page, roots, size) {
  const handles = (await Promise.all(roots.map(root => root.elementHandles()))).flat();
  const box = await page.evaluate(painted, handles);
  await page.evaluate(hideOutside, box);
  const clip = { x: box.left - MARGIN, y: box.top - MARGIN, width: box.right - box.left + 2 * MARGIN, height: box.bottom - box.top + 2 * MARGIN };
  if (clip.x < 0 || clip.y < 0 || clip.x + clip.width > size.width || clip.y + clip.height > size.height) throw new Error(`No room for the margin round ${JSON.stringify(box)} in ${size.width}×${size.height}`);
  return clip;
}

/**
 * A screen of the demo as a JPEG (the paper's grain makes a PNG ten times heavier), whole or a close-up
 * (`roots`, see `CLOSEUPS`), at `scale`. The interface in English on a French device: the demo's people
 * are French, and a device's region is what their numbers are read in.
 */
async function capture(browser, base, path, scheme, { roots, prepare, scale = 1, size = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale, colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}${path}?demo=1&lang=en`);
  await page.waitForTimeout(2_500);
  if (prepare) {
    await prepare(page);
    await page.waitForTimeout(300);
  }
  const shot = await page.screenshot({ type: 'jpeg', quality: QUALITY, clip: roots ? await closeupClip(page, roots(page), size) : undefined });
  await context.close();
  if (errors.length > 0) throw new Error(`${path}: ${errors.join(' | ')}`);
  return shot;
}

/** A JPEG's size in pixels, from its frame header. */
function jpegSize(bytes) {
  for (let at = 2; at < bytes.length; ) {
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  throw new Error('Not a JPEG');
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
      for (const [name, { path, roots, prepare, size }] of Object.entries(CLOSEUPS)) {
        const shot = await capture(browser, base, path, scheme, { roots, prepare, size, scale: 2 });
        const { width: shotWidth, height: shotHeight } = jpegSize(shot);
        writeFileSync(`${OUT}${name}-${scheme}.jpg`, await draw(browser, closeupPage(design, brand, scheme, shot, { width: shotWidth, height: shotHeight })));
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
