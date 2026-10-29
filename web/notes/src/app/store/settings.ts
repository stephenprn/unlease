/**
 * Device settings: where the server is, how to look (the theme, the colours and
 * the ground, the paper's grain), how the board lays out, which languages a
 * search by word understands.
 *
 * Kept in localStorage as one JSON value. They never sync: a token belongs to
 * a browser, and so does a theme choice. Every access is guarded, because
 * storage can be blocked (private windows, strict site settings) and the app
 * must still open, just without remembering.
 */
import { create } from 'zustand';

import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@unlease/design/appearance';
import { isLocale, setLocale, type Locale } from '@unlease/core/i18n';

import { getStorageName } from '../env';

export type ThemePreference = 'system' | 'light' | 'dark';
export type BoardLayout = 'wall' | 'list';

/** A language the app's word searches understand (an emoji by its name, for one). */
export type Language = 'fr' | 'en';

/** Every language on offer, as Réglages lists them: each by its own name. */
export const LANGUAGES: readonly { readonly id: Language; readonly name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
];

export interface ServerConfig {
  /** Origin of the Carnet server, e.g. `https://carnet-api.example.fr`. */
  readonly url: string;
  readonly token: string;
}

export interface SettingsState {
  readonly theme: ThemePreference;
  readonly layout: BoardLayout;
  readonly server: ServerConfig | null;
  /** The first-run screen was answered (connected, or "later"). */
  readonly onboarded: boolean;
  /**
   * Whether the server reads links (a Claude key is set there), as last heard
   * from `GET /api/settings`; null until known. Remembered so a link saved
   * offline is marked right away (the phone's `reading`).
   */
  readonly reading: boolean | null;
  /** Seerr's address as the server last gave it ('' when not linked): its module shows on films and series. */
  readonly seerr: string;
  /** The languages searched by word, at least one, in the order of `LANGUAGES`. */
  readonly languages: readonly Language[];
  /** The paper's grain on every sheet; off, sheets are flat colour (the ground's own grain is the appearance's). */
  readonly grain: boolean;
  /** The colours and the ground on this device (`design/appearance`). */
  readonly appearance: Appearance;
  /** The interface's language (`core/i18n`). */
  readonly locale: Locale;
}

const ALL_LANGUAGES: readonly Language[] = LANGUAGES.map(language => language.id);

const DEFAULTS: SettingsState = { theme: 'system', layout: 'wall', server: null, onboarded: false, reading: null, seerr: '', languages: ALL_LANGUAGES, grain: true, appearance: DEFAULT_APPEARANCE, locale: 'fr' };

export const useSettingsStore = create<SettingsState>(() => DEFAULTS);

export const selectThemePreference = (s: SettingsState): ThemePreference => s.theme;
export const selectLayout = (s: SettingsState): BoardLayout => s.layout;
export const selectServer = (s: SettingsState): ServerConfig | null => s.server;
export const selectOnboarded = (s: SettingsState): boolean => s.onboarded;
export const selectReading = (s: SettingsState): boolean | null => s.reading;
export const selectLanguages = (s: SettingsState): readonly Language[] => s.languages;
export const selectGrain = (s: SettingsState): boolean => s.grain;
export const selectAppearance = (s: SettingsState): Appearance => s.appearance;
export const selectLocale = (s: SettingsState): Locale => s.locale;
/** Links get read: a server is connected and has not said it lacks a key (unknown counts as yes). */
export const selectCanRead = (s: SettingsState): boolean => s.server !== null && s.reading !== false;
export const selectSeerr = (s: SettingsState): boolean => s.server !== null && s.seerr !== '';
export const selectSeerrUrl = (s: SettingsState): string => (s.server ? s.seerr : '');

const storageKey = (): string => `${getStorageName()}.settings`;

function isServer(value: unknown): value is ServerConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerConfig).url === 'string' &&
    typeof (value as ServerConfig).token === 'string'
  );
}

/** The stored languages, known ones only, in their list's order; none left reads as all. */
function readLanguages(value: unknown): readonly Language[] {
  const stored = Array.isArray(value) ? value : [];
  const known = ALL_LANGUAGES.filter(id => stored.includes(id));
  return known.length > 0 ? known : ALL_LANGUAGES;
}

export function loadSettings(): void {
  let stored: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(storageKey());
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable or blocked: start from the defaults.
  }
  useSettingsStore.setState(
    {
      theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
      layout: stored.layout === 'list' ? 'list' : 'wall',
      server: isServer(stored.server) && stored.server.url ? stored.server : null,
      onboarded: stored.onboarded === true,
      reading: typeof stored.reading === 'boolean' ? stored.reading : null,
      seerr: typeof stored.seerr === 'string' ? stored.seerr : '',
      languages: readLanguages(stored.languages),
      grain: stored.grain !== false,
      // The old single grain switch turned the ground's off too: it stays off until the ground's own is set.
      appearance: parseAppearance(stored.appearance, stored.grain !== false),
      // Until one is chosen: French in a browser set in French, English otherwise.
      locale: isLocale(stored.locale) ? stored.locale : typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en',
    },
    true,
  );
  setLocale(useSettingsStore.getState().locale);
}

function save(patch: Partial<SettingsState>): void {
  useSettingsStore.setState(patch);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(useSettingsStore.getState()));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

export const setTheme = (theme: ThemePreference): void => save({ theme });
export const setLayout = (layout: BoardLayout): void => save({ layout });
export const setOnboarded = (): void => save({ onboarded: true });
export const setReading = (reading: boolean | null): void => save({ reading });
export const setSeerrUrl = (seerr: string): void => save({ seerr });
export const setGrain = (grain: boolean): void => save({ grain });
export const setAppearance = (appearance: Appearance): void => save({ appearance });

/** The interface's language: every screen is drawn again in it. */
export function setInterfaceLocale(locale: Locale): void {
  setLocale(locale);
  save({ locale });
}

/** A language on or off; the last one left stays on. */
export function setLanguage(language: Language, on: boolean): void {
  const current = useSettingsStore.getState().languages;
  const next = ALL_LANGUAGES.filter(id => (id === language ? on : current.includes(id)));
  if (next.length > 0) save({ languages: next });
}

/** Scheme required, no trailing slash, as the phone stores it. */
export function normalizeServer(config: ServerConfig): ServerConfig {
  const url = config.url.trim().replace(/\/+$/, '');
  return { url: /^https?:\/\//i.test(url) ? url : `https://${url}`, token: config.token.trim() };
}

export function setServer(config: ServerConfig | null): void {
  // Another server may read links or not: forget what this one said.
  save(config ? { server: normalizeServer(config) } : { server: null, reading: null, seerr: '' });
}

/** Test seam. */
export function resetSettings(): void {
  useSettingsStore.setState(DEFAULTS, true);
}
