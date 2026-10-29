/**
 * The appearance laid on the page: the colours and the ground chosen in Réglages, as custom
 * properties on `<html>` for the theme on screen (the stylesheet keeps Carnet's own,
 * `virtual:carnet/tokens.css`), the ground's grain as `data-ground-grain`, the browser chrome
 * on the ground's top, and the tab's icon in the primary. The page's security policy refuses
 * inline stylesheets, so the values go through the CSSOM, one theme at a time, again whenever
 * the theme or the system's changes.
 */
import { useLayoutEffect, useState } from 'react';

import { appearanceKey, DEFAULT_APPEARANCE, groundBackground, markColors, resolveAppearance, type Appearance } from '@unlease/design/appearance';
import { MARK_CARD, MARK_PEBBLE, MARK_VIEWBOX } from '@unlease/design/mark';
import type { Mode, Roles } from '@unlease/design/palette';

import { selectAppearance, selectThemePreference, useSettingsStore, type ThemePreference } from '../app/store/settings';

/** The roles a primary and an accent paint: every other colour stays the stylesheet's. */
const ROLE_NAMES: readonly (keyof Roles)[] = ['leaf', 'onLeaf', 'focus', 'actionContainer', 'onActionContainer', 'slipAction', 'action', 'onAction', 'link', 'highlight'];

const kebab = (name: string): string => name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);

const GROUND_NAMES = ['--ground-layers', '--ground-top', '--ground-bottom'] as const;

/** Every property this sets, to take back when Carnet's own colours return. */
export const APPEARANCE_PROPERTIES: readonly string[] = [...ROLE_NAMES.map(role => `--${kebab(role)}`), ...GROUND_NAMES];

/** The custom properties an appearance gives the page in `mode`. */
export function appearanceVariables(appearance: Pick<Appearance, 'primary' | 'accent' | 'ground'>, mode: Mode): Record<string, string> {
  const { roles, ground } = resolveAppearance(appearance, mode);
  const out: Record<string, string> = {};
  for (const role of ROLE_NAMES) out[`--${kebab(role)}`] = roles[role];
  out['--ground-layers'] = groundBackground(ground);
  out['--ground-top'] = ground.top;
  out['--ground-bottom'] = ground.bottom;
  return out;
}

const DARK = '(prefers-color-scheme: dark)';

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches;
}

/** The theme on screen: the one pinned, or the system's. */
export function shownMode(theme: ThemePreference, dark = systemDark()): Mode {
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
}

/** Carnet's own colours and ground: the stylesheet already holds them. */
const ownColours = (appearance: Appearance): boolean => appearanceKey(appearance) === appearanceKey(DEFAULT_APPEARANCE);

/** The tab's icon: the mark in the primary, or the build's own file while the primary is Carnet's. */
function applyTabIcon(primary: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  link.dataset.own ??= link.getAttribute('href') ?? '';
  if (primary === DEFAULT_APPEARANCE.primary) {
    link.href = link.dataset.own;
    return;
  }
  const { tile, card } = markColors(primary);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}"><path d="${MARK_PEBBLE}" fill="${tile}"/><path d="${MARK_CARD}" fill="${card}" fill-rule="evenodd"/></svg>`;
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Lays `appearance` on the page for `theme` (and the system's theme when it follows it). */
export function applyAppearance(appearance: Appearance, theme: ThemePreference, dark = systemDark()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = shownMode(theme, dark);
  if (ownColours(appearance)) {
    for (const name of APPEARANCE_PROPERTIES) root.style.removeProperty(name);
  } else {
    for (const [name, value] of Object.entries(appearanceVariables(appearance, mode))) root.style.setProperty(name, value);
  }
  if (appearance.grain) delete root.dataset.groundGrain;
  else root.dataset.groundGrain = 'off';
  // The browser's chrome takes the ground's top, for each theme its meta answers to.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    const metaMode: Mode = theme === 'system' ? (meta.media.includes('dark') ? 'dark' : 'light') : theme;
    meta.content = resolveAppearance(appearance, metaMode).ground.top;
  });
  applyTabIcon(appearance.primary);
}

/** Whether the system is dark, followed while the theme is the system's. */
function useSystemDark(theme: ThemePreference): boolean {
  const [dark, setDark] = useState(systemDark);
  useLayoutEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK);
    const follow = (): void => setDark(query.matches);
    follow();
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [theme]);
  return dark;
}

/** The theme on screen, kept up to date: a picker paints its swatches in it. */
export function useShownMode(): Mode {
  const theme = useSettingsStore(selectThemePreference);
  return shownMode(theme, useSystemDark(theme));
}

/** Keeps the page on the appearance and the theme chosen, and on the system's theme while it follows it. */
export function useAppearanceEffect(): void {
  const appearance = useSettingsStore(selectAppearance);
  const theme = useSettingsStore(selectThemePreference);
  const dark = useSystemDark(theme);
  useLayoutEffect(() => applyAppearance(appearance, theme, dark), [appearance, theme, dark]);
}
