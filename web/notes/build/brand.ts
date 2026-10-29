/**
 * The web app's brand files, drawn from the shared mark and palette: the tab
 * icon, the install icons and the web manifest. Nothing here is drawn by hand,
 * so the browser tab, the installed app and the Android launcher show one mark.
 */
import { APP_NAME } from '@unlease/notes/brand';
import { MARK_COLORS, ROLES } from '@unlease/design/palette';
import { MARK_CARD, MARK_PEBBLE } from '@unlease/design/mark';

/** The card, its leaf cut out, on the 100 grid of the visible tile, placed by `transform`. */
function drawing(transform: string): string {
  return `<path d="${MARK_CARD}" transform="${transform}" fill="${MARK_COLORS.card}" fill-rule="evenodd"/>`;
}

/** The mark on its pebble at `side`, as in the app. */
function pebbled(side: number): string {
  const scale = `scale(${side / 100})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><path d="${MARK_PEBBLE}" transform="${scale}" fill="${MARK_COLORS.tile}"/>${drawing(scale)}</svg>`;
}

/** The tab icon, the same by day and night. */
export function faviconSvg(): string {
  return pebbled(100);
}

/** Install icon. */
export function iconSvg(): string {
  return pebbled(512);
}

/** Maskable variant: full bleed, the tile's drawing inside the 80% safe circle. */
export function maskableIconSvg(): string {
  const scale = 0.8 * 512 / 100;
  const offset = (512 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${MARK_COLORS.tile}"/>${drawing(`translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${scale.toFixed(4)})`)}</svg>`;
}

export function manifestJson(): string {
  const manifest = {
    id: '/',
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'Notes, listes et liens, rangés sur votre propre serveur.',
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
    shortcuts: [
      { name: 'Nouvelle note', url: 'capture/note' },
      { name: 'Nouvelle liste', url: 'capture/checklist' },
      { name: 'Classer un lien', url: 'capture/link' },
    ],
    // Installed on Android or ChromeOS, the app appears in the share sheet too.
    share_target: { action: 'capture/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
