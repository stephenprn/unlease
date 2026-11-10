/**
 * Each web app's brand files, drawn from the shared marks and palette: its tab icon, its install
 * icons and its web manifest. Carnet wears its card and its leaf, Pages its sheet and its writing,
 * Contacts its card and its person, Agenda its page and its days (`@unlease/design/mark`), each on the matcha pebble, the same marks as their Android launchers.
 * Nothing here is drawn by hand, so the browser tab, the installed app and the phone show one mark.
 */
import { APPS } from '@unlease/core/apps';
import { APP_WORDS } from '@unlease/core/appWords';
import { MARK_COLORS, ROLES } from '@unlease/design/palette';
import { MARK_CALENDAR, MARK_CARD, MARK_CONTACT, MARK_PAGE, MARK_PEBBLE } from '@unlease/design/mark';

import { webPath, type WebApp } from './paths.ts';

export { WEB_PATHS, webPath, type WebApp } from './paths.ts';

/** A web app's name (the same in every language). */
export function webAppName(app: WebApp): string {
  return APPS[app].name;
}

/** What it is for, in a line (French: the manifest's language). */
export function webAppTagline(app: WebApp): string {
  return APP_WORDS[app].tagline;
}

/** Each app's shape on its pebble. */
const SHAPES: Readonly<Record<WebApp, string>> = { notes: MARK_CARD, pages: MARK_PAGE, contacts: MARK_CONTACT, calendar: MARK_CALENDAR };

/** The app's shape, what it holds cut out, on the 100 grid of the visible tile, placed by `transform`. */
function drawing(app: WebApp, transform: string): string {
  return `<path d="${SHAPES[app]}" transform="${transform}" fill="${MARK_COLORS.card}" fill-rule="evenodd"/>`;
}

/** The mark on its pebble at `side`, as in the app. */
function pebbled(app: WebApp, side: number): string {
  const scale = `scale(${side / 100})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><path d="${MARK_PEBBLE}" transform="${scale}" fill="${MARK_COLORS.tile}"/>${drawing(app, scale)}</svg>`;
}

/** The tab icon, the same by day and night. */
export function faviconSvg(app: WebApp): string {
  return pebbled(app, 100);
}

/** Install icon. */
export function iconSvg(app: WebApp): string {
  return pebbled(app, 512);
}

/** Maskable variant: full bleed, the tile's drawing inside the 80% safe circle. */
export function maskableIconSvg(app: WebApp): string {
  const scale = (0.8 * 512) / 100;
  const offset = (512 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${MARK_COLORS.tile}"/>${drawing(app, `translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})`)}</svg>`;
}

/** What each app adds to its manifest: Carnet's capture links, its share target. */
const EXTRAS: Readonly<Record<WebApp, Record<string, unknown>>> = {
  notes: {
    // Carnet's capture links (`/notes/capture/…`), relative to the manifest as the start is.
    shortcuts: [
      { name: 'Nouvelle note', url: 'capture/note' },
      { name: 'Nouvelle liste', url: 'capture/checklist' },
      { name: 'Classer un lien', url: 'capture/link' },
    ],
    // Installed on Android or ChromeOS, the app appears in the share sheet too: a link shared goes to Carnet.
    share_target: { action: 'capture/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  },
  pages: {},
  // A new contact from the installed app's shortcut (`/contacts/new`).
  contacts: { shortcuts: [{ name: 'Créer un contact', url: 'new' }] },
  // A new event from the installed app's shortcut (`/agenda/new`).
  calendar: { shortcuts: [{ name: 'Créer un événement', url: 'new' }] },
};

/**
 * The app's manifest, served beside its page (`/notes/manifest.webmanifest`). Carnet keeps the
 * identity it was installed under before the suite had its own apps (`/`), so an installed copy
 * updates in place; Pages and Contacts have their own.
 */
export function manifestJson(app: WebApp): string {
  const name = webAppName(app);
  const manifest = {
    id: app === 'notes' ? '/' : `/${webPath(app)}/`,
    name,
    short_name: name,
    description: webAppTagline(app),
    lang: 'fr',
    dir: 'ltr',
    // Relative to the manifest, so the app installs from a sub-path too (the demo on GitHub Pages).
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: ROLES.light.wall,
    theme_color: ROLES.light.wall,
    icons: [
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    ...EXTRAS[app],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
