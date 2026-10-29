/**
 * Screenshots of every surface, for design review: light and dark, desktop
 * (1440×900) and phone (390×844), from the dev-only demo (`?demo`), which
 * runs a fake server in the page so syncing, images and link reading happen.
 *
 *   npm run screenshots                 # starts Vite itself
 *   CARNET_URL=http://localhost:5173 npm run screenshots   # or uses a running one
 *   CARNET_LOCALE=en npm run screenshots   # the interface in English (files end in -en)
 *
 * Output: .impeccable/review/web/<surface>-<scheme>-<width>.png, at the repository's root
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const OUT = fileURLToPath(new URL('../../../.impeccable/review/web/', import.meta.url));
const VIEWPORTS = [
  { width: 1440, height: 900, scale: 1, mobile: false },
  { width: 390, height: 844, scale: 2, mobile: true },
];
const SCHEMES = ['light', 'dark'];
const LOCALE = process.env.CARNET_LOCALE === 'en' ? 'en' : 'fr';
const PASTED = 'https://www.cinema-lumiere.fr/films/la-nuit-des-phares';

/** A collection's "Modules", from its menu. */
async function openModules(page) {
  await page.getByRole('button', { name: /^(Plus d’actions|More actions)$/ }).first().click();
  await page.getByRole('menuitem', { name: 'Modules' }).click();
  await page.waitForTimeout(500);
}

/** The shopping modules switched on in "Mode", then its jacket's page, and one of them opened when `module` says which (until `shown` is on screen). */
function shoppingModules(module, shown) {
  return async page => {
    await openModules(page);
    await page.getByRole('switch', { name: /^(Moins cher ailleurs|Cheaper elsewhere)/ }).click();
    await page.getByRole('switch', { name: /^(Seconde main|Second-hand)/ }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByRole('link', { name: /^Veste en laine bouillie/ }).first().click();
    await page.waitForTimeout(700);
    if (!module) return;
    await page.getByRole('button', { name: module }).click();
    await page.getByText(shown).first().waitFor();
    await page.waitForTimeout(700);
  };
}

/** `modules` switched on in the collection's sheet (each by its name's start), the link `title` opened, then `button` pressed until `shown` is on screen. */
function withModules(modules, title, button, shown) {
  return async page => {
    await openModules(page);
    for (const module of modules) await page.getByRole('switch', { name: module }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByRole('link', { name: title }).first().click();
    await page.waitForTimeout(900);
    if (!button) return;
    await page.getByRole('button', { name: button }).click();
    if (shown) await page.getByText(shown).first().waitFor();
    await page.waitForTimeout(700);
  };
}

const RATINGS = /^(Notes|Ratings)/;
const RECAP = /^(Résumé jusqu’ici|Story so far)/;
const COVERAGE = /^(Autres regards|Other takes)/;
const ASK = /^(Demander à Claude|Ask Claude)/;
const FILM = /^Les Feux de septembre/;
const SERIES = /^Station Nord/;
const ARTICLE = /^Pourquoi les villes ralentissent/;

/** A paste on the board, as the browser fires it. */
async function paste(page, text) {
  await page.evaluate(value => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

const SURFACES = [
  { name: 'setup', path: '/?demo=setup' },
  { name: 'board', path: '/?demo=1' },
  { name: 'note', path: '/note/demo-courses?demo=1' },
  { name: 'note-photo', path: '/note/demo-balcon?demo=1' },
  { name: 'line', path: '/line/line-mode?demo=1' },
  { name: 'link', path: '/link/demo-link-line-mode-1?demo=1' },
  { name: 'link-failed', path: '/link/demo-link-line-mode-3?demo=1' },
  { name: 'link-unread', path: '/link/demo-link-inbox-1?demo=1' },
  {
    name: 'link-coupons-asking',
    path: '/link/demo-link-line-mode-1?demo=1',
    // A price still to pay: Claude's promo codes, while the pretend search runs...
    async act(page) {
      await page.getByRole('button', { name: /^(Codes promo|Promo codes)$/ }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'link-coupons',
    path: '/link/demo-link-line-mode-1?demo=1',
    // ...and once it has answered.
    async act(page) {
      await page.getByRole('button', { name: /^(Codes promo|Promo codes)$/ }).click();
      await page.getByText('LIVRAISON', { exact: true }).waitFor();
      await page.waitForTimeout(700);
    },
  },
  // The link modules: a collection's sheet of them, then what they show on a link.
  { name: 'line-modules', path: '/line/line-mode?demo=1', act: openModules },
  { name: 'link-modules', path: '/line/line-mode?demo=1', act: shoppingModules() },
  { name: 'link-cheaper', path: '/line/line-mode?demo=1', act: shoppingModules(/^(Moins cher ailleurs|Cheaper elsewhere)$/, 'Grand Bazar') },
  { name: 'link-secondhand', path: '/line/line-mode?demo=1', act: shoppingModules(/^(Seconde main|Second-hand)$/, 'Le Grenier') },
  {
    name: 'link-groceries',
    path: '/link/demo-link-inbox-2?demo=1',
    async act(page) {
      await page.getByRole('button', { name: /^(Liste de courses|Shopping list)$/ }).click();
      await page.getByText('4 pommes').waitFor();
      await page.waitForTimeout(700);
    },
  },
  { name: 'link-place', path: '/link/demo-link-line-restos-0?demo=1' },
  // Films, series and articles: their modules on the link, then each one open.
  { name: 'link-film-modules', path: '/line/line-films?demo=1', act: withModules([RATINGS, ASK], FILM) },
  { name: 'link-ratings', path: '/line/line-films?demo=1', act: withModules([RATINGS], FILM, /^(Notes|Ratings)$/, 'IMDb') },
  { name: 'link-recap-pick', path: '/line/line-films?demo=1', act: withModules([RECAP], SERIES, /^(Résumé jusqu’ici|Story so far)$/) },
  {
    name: 'link-recap',
    path: '/line/line-films?demo=1',
    async act(page) {
      await withModules([RECAP], SERIES, /^(Résumé jusqu’ici|Story so far)$/)(page);
      await page.getByRole('button', { name: /^(Saison suivante|Next season)$/ }).click();
      for (let episode = 0; episode < 3; episode += 1) await page.getByRole('button', { name: /^(Épisode suivant|Next episode)$/ }).click();
      await page.getByRole('button', { name: /^(Résumer|Recap)$/ }).click();
      await page.getByText('Hanna Lind').first().waitFor();
      await page.waitForTimeout(700);
    },
  },
  { name: 'link-coverage', path: '/line/line-lire?demo=1', act: withModules([COVERAGE], ARTICLE, /^(Autres regards|Other takes)$/, 'Le Quotidien du Matin') },
  { name: 'link-ask', path: '/line/line-lire?demo=1', act: withModules([ASK], ARTICLE, /^(Demander à Claude|Ask Claude)$/) },
  {
    name: 'link-ask-answer',
    path: '/line/line-lire?demo=1',
    async act(page) {
      await withModules([ASK], ARTICLE, /^(Demander à Claude|Ask Claude)$/)(page);
      await page.getByRole('button', { name: /^(Quels sont les chiffres clés|What are the key figures)/ }).click();
      await page.getByRole('switch', { name: /^(Chercher aussi sur le web|Search the web too)$/ }).click();
      await page.getByRole('button', { name: /^(Demander|Ask)$/ }).click();
      await page.getByRole('heading', { name: 'Sources' }).waitFor();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'link-recipe',
    path: '/link/demo-link-inbox-2?demo=1',
    // "Pour N personnes" two people up: the stepper in the bar.
    async act(page) {
      await page.getByRole('button', { name: /^(Une personne de plus|One more person)$/ }).click();
      await page.getByRole('button', { name: /^(Une personne de plus|One more person)$/ }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'link-cooking',
    path: '/link/demo-link-inbox-2?demo=1',
    async act(page) {
      await page.getByRole('button', { name: /^(Une personne de plus|One more person)$/ }).click();
      await page.getByRole('button', { name: /^(En cuisine|Cook mode)$/ }).click();
      await page.getByText(/Préchauffer/).first().waitFor();
      await page.getByRole('button', { name: /^(Suivante|Next)$/ }).click();
      await page.getByRole('button', { name: /^(Lancer un minuteur|Start a)/ }).first().click();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'admin-seerr',
    path: '/admin?demo=1',
    async act(page) {
      await page.locator('#seerr').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'page-copy',
    path: '/link/demo-link-line-lire-0?demo=1',
    // The page "Garder une copie" made, opened from the link.
    async act(page) {
      await page.getByRole('button', { name: /^(Garder une copie|Keep a copy)$/ }).click();
      await page.getByRole('button', { name: /^(Voir la copie|See the copy)$/ }).click();
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'link-copy',
    path: '/link/demo-link-line-lire-0?demo=1',
    async act(page) {
      await page.getByRole('button', { name: /^(Garder une copie|Keep a copy)$/ }).click();
      await page.getByRole('button', { name: /^(Voir la copie|See the copy)$/ }).waitFor();
      await page.waitForTimeout(400);
    },
  },
  { name: 'collections', path: '/lines?demo=1' },
  {
    name: 'labels',
    path: '/note/demo-courses?demo=1',
    // The label picker, its tags as the checkboxes.
    async act(page) {
      await page.getByRole('button', { name: 'Labels', exact: true }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'line-stamped',
    path: '/line/line-mode?demo=1',
    fullPage: true,
    // A link with no picture stamped done: the stamp alone in its frame. The row's stamp shows only under a pointer, so it is pressed from the script.
    async act(page) {
      await page.locator('button[aria-label="Marquer : fait"]').first().evaluate(button => button.click());
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'transfer',
    path: '/?demo=1',
    // Paste a link on the board, then catch the train mid-run.
    async act(page) {
      await paste(page, PASTED);
      await page.waitForTimeout(1_400);
    },
  },
  {
    name: 'transfer-landed',
    path: '/?demo=1',
    // ...and once it has landed on its line.
    async act(page) {
      await paste(page, PASTED);
      await page.waitForTimeout(4_600);
    },
  },
  { name: 'settings', path: '/settings?demo=1', fullPage: true },
  // The whole page: the backups and the Seafile folder sit below the fold.
  { name: 'admin', path: '/admin?demo=1', fullPage: true },
  { name: 'empty', path: '/?demo=empty' },
  // Pages, the knowledge base: its home, a travel page (callout, columns, table, mentions), code, a reading table.
  { name: 'pages', path: '/pages?demo=1', fullPage: true },
  { name: 'page', path: '/page/demo-page-lisbonne?demo=1', fullPage: true },
  // The first screen alone (the README's picture).
  { name: 'page-top', path: '/page/demo-page-lisbonne?demo=1' },
  { name: 'page-code', path: '/page/demo-page-technique?demo=1', fullPage: true },
  { name: 'page-table', path: '/page/demo-page-lectures?demo=1', fullPage: true },
  {
    name: 'page-slash',
    path: '/page/demo-page-recettes?demo=1',
    // The "/" menu under the caret, at the end of the page.
    async act(page) {
      const last = page.locator('[data-select-block] [contenteditable="true"]').last();
      await last.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('/');
      await page.waitForTimeout(500);
    },
  },
];

/** The spotlight opened from the board's keys, and what is typed in it. */
function spotlight(query = '') {
  return async page => {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(400);
    if (query) await page.keyboard.type(query, { delay: 30 });
    await page.waitForTimeout(700);
  };
}

/** A slip in one tone, from the app's own store (Vite serves the module the app imports). */
function slip(tone, message, action) {
  return async page => {
    await page.evaluate(
      async ([kind, text, label]) => {
        const ui = await import('/src/app/store/ui.ts');
        ui.showSnack(text, label ? { label, run: () => {} } : undefined, { tone: kind });
      },
      [tone, message, action ?? null],
    );
    await page.waitForTimeout(500);
  };
}

SURFACES.push(
  {
    name: 'finish',
    path: '/note/demo-courses?demo=1',
    // "Couleur et papier": a wash chosen, then Seyès over it.
    async act(page) {
      await page.getByRole('button', { name: 'Couleur et papier' }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('radio', { name: 'Sarcelle' }).click();
      await page.getByRole('radio', { name: 'Seyès' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'new-collection',
    path: '/lines?demo=1',
    // A long dialog: its body scrolls between the title and the actions; an emblem chosen.
    async act(page) {
      await page.getByRole('button', { name: 'Nouvelle collection' }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole('radio', { name: 'Étoile' }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'new-collection-scrolled',
    path: '/lines?demo=1',
    async act(page) {
      await page.getByRole('button', { name: 'Nouvelle collection' }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole('radio', { name: 'Étoile' }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'capture',
    path: '/?demo=1',
    async act(page) {
      await page.keyboard.press('k');
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'shortcuts',
    path: '/?demo=1',
    async act(page) {
      await page.keyboard.press('?');
      await page.waitForTimeout(500);
    },
  },
  { name: 'slip-info', path: '/?demo=1', act: slip('info', 'Seafile désactivé : vos fichiers sont sur le serveur.') },
  { name: 'slip-success', path: '/?demo=1', act: slip('success', 'Note archivée', 'Annuler') },
  { name: 'slip-warning', path: '/?demo=1', act: slip('warning', 'Connecté, mais le serveur n’a pas de clé Claude.') },
  { name: 'slip-error', path: '/?demo=1', act: slip('error', 'Ce n’est pas un lien') },
  // The spotlight (⌘P, Ctrl+P or Ctrl+K): empty on what was opened lately, then searching.
  { name: 'spotlight', path: '/page/demo-page-lisbonne?demo=1', act: spotlight() },
  { name: 'spotlight-search', path: '/?demo=1', act: spotlight('lisbonne') },
  { name: 'spotlight-link', path: '/?demo=1', act: spotlight('veste laine') },
  { name: 'spotlight-typo', path: '/?demo=1', act: spotlight('crepes lisbone') },
  { name: 'spotlight-nothing', path: '/?demo=1', act: spotlight('zanzibar') },
  {
    name: 'spotlight-filters',
    path: '/?demo=1',
    // A label typed after #, a date from its menu, then Tab to the notes alone.
    async act(page) {
      await spotlight('#trav')(page);
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: /^Modifié/ }).click();
      await page.getByRole('menuitem', { name: '30 derniers jours' }).click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'settings-flat',
    path: '/settings?demo=1',
    // "Effet de grain" off: the ground and the sheets without their grain.
    async act(page) {
      await page.getByRole('switch', { name: /Effet de grain/ }).click();
      await page.waitForTimeout(400);
    },
  },
);

/** Words selected with the pointer, as a person drags over them, in the page's first text that holds them. */
async function selectWords(page, words) {
  const box = await page.evaluate(text => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(text);
      if (at < 0 || !node.parentElement?.closest('[contenteditable="true"]')) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    }
    return null;
  }, words);
  if (!box) return;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

SURFACES.push(
  { name: 'note-rich', path: '/note/demo-lyon?demo=1' },
  { name: 'note-rich-format', path: '/note/demo-lyon?demo=1', act: page => selectWords(page, 'Café des Fédérations') },
  { name: 'note-drawing', path: '/note/demo-potager?demo=1' },
  {
    name: 'page-drawing',
    path: '/page/demo-page-lisbonne?demo=1',
    async act(page) {
      await page.getByRole('button', { name: /^(Modifier le dessin|Edit the drawing)$/ }).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'page-drawing-editor',
    path: '/page/demo-page-lisbonne?demo=1',
    async act(page) {
      await page.getByRole('button', { name: /^(Modifier le dessin|Edit the drawing)$/ }).first().click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'page-date',
    path: '/page/demo-page-lisbonne?demo=1',
    async act(page) {
      await page.locator('[data-date]').first().click();
      await page.waitForTimeout(700);
    },
  },
  { name: 'empty-trash', path: '/trash?demo=empty' },
  {
    name: 'note-menu-empty',
    path: '/?demo=1',
    // A new note, nothing written yet: « Dupliquer » waits in the second ink.
    async act(page) {
      await page.keyboard.press('c');
      await page.waitForTimeout(900);
      await page.getByRole('button', { name: /^(Plus d’actions|More actions)$/ }).last().click();
      await page.waitForTimeout(500);
    },
  },
);

async function main() {
  let server = null;
  let base = process.env.CARNET_URL;
  if (!base) {
    server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)), server: { port: 5198, strictPort: false }, logLevel: 'error' });
    await server.listen();
    base = server.resolvedUrls.local[0].replace(/\/$/, '');
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const only = process.argv.slice(2);
  try {
    for (const scheme of SCHEMES) {
      for (const viewport of VIEWPORTS) {
        for (const surface of SURFACES) {
          if (only.length > 0 && !only.includes(surface.name)) continue;
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: viewport.scale,
            isMobile: viewport.mobile,
            hasTouch: viewport.mobile,
            colorScheme: scheme,
            reducedMotion: 'no-preference',
            locale: LOCALE === 'en' ? 'en-GB' : 'fr-FR',
            timezoneId: 'Europe/Paris',
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => message.type() === 'error' && errors.push(message.text()));
          await page.goto(`${base}${surface.path}${LOCALE === 'en' ? '&lang=en' : ''}`);
          await page.waitForTimeout(2_200);
          if (surface.act) await surface.act(page);
          const file = `${OUT}${surface.name}-${scheme}-${viewport.width}${LOCALE === 'en' ? '-en' : ''}.png`;
          await page.screenshot({ path: file, fullPage: surface.fullPage === true });
          console.log(`${file}${errors.length ? `  (${errors.length} errors: ${errors.join(' | ')})` : ''}`);
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}

await main();
