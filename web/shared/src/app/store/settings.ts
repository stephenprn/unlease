/**
 * Device settings: where the server is and which apps it runs (as last heard),
 * how to look (the theme, the colours and the ground, the grains), which
 * languages a search by word understands. Each app keeps its own beside them
 * (Carnet's board layout: `@notes/app/store/prefs`).
 *
 * Kept in localStorage as one JSON value, shared by every app's web app on
 * this address (`env.ts`): set in one, the other follows. They never sync: a
 * token belongs to a browser, and so does a theme choice. Every access is guarded, because
 * storage can be blocked (private windows, strict site settings) and the app
 * must still open, just without remembering.
 *
 * The look (the theme, the colours, the ground, taken whole) is each app's: chosen in an app's
 * Réglages it is kept under that app's key (`lookKey`), and the shared value keeps the suite's, the
 * first run's, for an app that has none of its own yet. « Appliquer aux autres » writes it into the
 * other apps' keys (`applyLookTo`); an open tab of one follows at once. The grains stay the suite's.
 */
import { create } from 'zustand';

import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@unlease/design/appearance';
import { isAppId, SUITE_SLUG, type AppId } from '@unlease/core/apps';
import { isLocale, setLocale, type Locale } from '@unlease/core/i18n';
import { parseServerFeatures, SERVER_FEATURES, type ServerFeature, type ServerFeatures } from '@unlease/core/sync/settings';

import { getDeviceName, getOwnApp } from '../env';

export type ThemePreference = 'system' | 'light' | 'dark';

/** A language the app's word searches understand (an emoji by its name, for one). */
export type Language = 'fr' | 'en';

/** Every language on offer, as Réglages lists them: each by its own name. */
export const LANGUAGES: readonly { readonly id: Language; readonly name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
];

export interface ServerConfig {
  /** Origin of the suite's server, e.g. `https://unlease.example.org`. */
  readonly url: string;
  readonly token: string;
}

export interface SettingsState {
  readonly theme: ThemePreference;
  readonly server: ServerConfig | null;
  /** The apps the server runs, as last heard (`/api/health`, `GET /api/settings`); null until known, or with no server. */
  readonly serverApps: readonly AppId[] | null;
  /** Which of the Administration's optional services the server has set up (Claude, S3, the drive, Seerr), as last heard; one left out is not known yet. */
  readonly serverFeatures: ServerFeatures;
  /** The first-run screen was answered (connected, or "later"). */
  readonly onboarded: boolean;
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

const DEFAULTS: SettingsState = { theme: 'system', server: null, serverApps: null, serverFeatures: {}, onboarded: false, languages: ALL_LANGUAGES, grain: true, appearance: DEFAULT_APPEARANCE, locale: 'fr' };

export const useSettingsStore = create<SettingsState>(() => DEFAULTS);

export const selectThemePreference = (s: SettingsState): ThemePreference => s.theme;
export const selectServer = (s: SettingsState): ServerConfig | null => s.server;
export const selectOnboarded = (s: SettingsState): boolean => s.onboarded;
export const selectLanguages = (s: SettingsState): readonly Language[] => s.languages;
export const selectGrain = (s: SettingsState): boolean => s.grain;
export const selectAppearance = (s: SettingsState): Appearance => s.appearance;
export const selectLocale = (s: SettingsState): Locale => s.locale;
export const selectServerApps = (s: SettingsState): readonly AppId[] | null => (s.server ? s.serverApps : null);

/** Whether a server is connected and has said it set up this service (`on`), said it has not or none is connected (`off`), or has not said yet (`unknown`). */
export type FeatureState = 'on' | 'off' | 'unknown';

export const selectServerFeatureState =
  (feature: ServerFeature) =>
  (s: SettingsState): FeatureState => {
    if (s.server === null) return 'off';
    const known = s.serverFeatures[feature];
    return known === undefined ? 'unknown' : known ? 'on' : 'off';
  };

/** The device's settings, every app's (`env.ts`). */
const storageKey = (): string => `${getDeviceName()}.settings`;

/** A look: the theme, the colours and the ground (its grain is the suite's: the shared value's). */
export interface Look {
  readonly theme: ThemePreference;
  readonly appearance: Appearance;
}

/** Where an app keeps its own look on this browser. */
export const lookKey = (app: AppId): string => `${getDeviceName()}.look.${app}`;

/** The suite's look, as the shared value keeps it: an app's until it chooses its own, and where the ground's grain lives. */
let suiteLook: Look = { theme: 'system', appearance: DEFAULT_APPEARANCE };

const readTheme = (value: unknown): ThemePreference => (value === 'light' || value === 'dark' ? value : 'system');

/** An app's own look, or null while it has none (or it is unreadable). */
function readOwnLook(app: AppId): Look | null {
  try {
    const raw = localStorage.getItem(lookKey(app));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { theme, appearance } = parsed as Record<string, unknown>;
    return { theme: readTheme(theme), appearance: parseAppearance(appearance) };
  } catch {
    return null;
  }
}

function writeOwnLook(app: AppId, look: Look): void {
  try {
    localStorage.setItem(lookKey(app), JSON.stringify(look));
  } catch {
    // Blocked storage: the look holds for this visit only.
  }
}

/** Where Carnet's web app kept them before the suite had its own apps: read once, when the suite's are not there yet. */
const CARNET_V0_KEY = 'carnet.settings';

function readStored(): string | null {
  const own = localStorage.getItem(storageKey());
  if (own !== null || getDeviceName() !== SUITE_SLUG) return own;
  return localStorage.getItem(CARNET_V0_KEY);
}

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

function readApps(value: unknown): readonly AppId[] | null {
  if (!Array.isArray(value)) return null;
  const apps = value.filter(isAppId);
  return apps.length > 0 ? apps : null;
}

export function loadSettings(): void {
  let stored: Record<string, unknown> = {};
  try {
    const raw = readStored();
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable or blocked: start from the defaults.
  }
  // The old single grain switch turned the ground's off too: it stays off until the ground's own is set.
  suiteLook = { theme: readTheme(stored.theme), appearance: parseAppearance(stored.appearance, stored.grain !== false) };
  const own = getOwnApp();
  const look = own ? readOwnLook(own) : null;
  useSettingsStore.setState(
    {
      theme: look?.theme ?? suiteLook.theme,
      server: isServer(stored.server) && stored.server.url ? stored.server : null,
      serverApps: readApps(stored.serverApps),
      serverFeatures: parseServerFeatures(stored.serverFeatures),
      onboarded: stored.onboarded === true,
      languages: readLanguages(stored.languages),
      grain: stored.grain !== false,
      appearance: look ? { ...look.appearance, grain: suiteLook.appearance.grain } : suiteLook.appearance,
      // Until one is chosen: French in a browser set in French, English otherwise.
      locale: isLocale(stored.locale) ? stored.locale : typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en',
    },
    true,
  );
  setLocale(useSettingsStore.getState().locale);
}

/** Another app's tab (or this app's in another tab) changed them, or sent this app a look: this one follows. */
export function followSettingsElsewhere(): () => void {
  const onStorage = (event: StorageEvent): void => {
    const own = getOwnApp();
    if (event.key === storageKey() || (own !== null && event.key === lookKey(own))) loadSettings();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/**
 * A look changed once set up is this app's own; before (the first run) it is the suite's, which
 * every app without its own takes. The ground's grain is the suite's either way.
 */
function save(patch: Partial<SettingsState>): void {
  useSettingsStore.setState(patch);
  const state = useSettingsStore.getState();
  if ('theme' in patch || 'appearance' in patch) {
    const own = getOwnApp();
    if (own !== null && state.onboarded) {
      writeOwnLook(own, { theme: state.theme, appearance: state.appearance });
      suiteLook = { ...suiteLook, appearance: { ...suiteLook.appearance, grain: state.appearance.grain } };
    } else {
      suiteLook = { theme: state.theme, appearance: state.appearance };
    }
  }
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ ...state, theme: suiteLook.theme, appearance: suiteLook.appearance }));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

/** This app's look, written into `apps`' own (« Appliquer aux autres »): each takes it as it opens, an open tab of one at once. */
export function applyLookTo(apps: readonly AppId[]): void {
  const { theme, appearance } = useSettingsStore.getState();
  for (const app of apps) writeOwnLook(app, { theme, appearance });
}

export const setTheme = (theme: ThemePreference): void => save({ theme });
export const setOnboarded = (): void => save({ onboarded: true });

/** The apps the server says it runs. */
export function setServerApps(apps: readonly AppId[]): void {
  const current = useSettingsStore.getState().serverApps;
  if (current && current.length === apps.length && current.every((id, at) => id === apps[at])) return;
  save({ serverApps: [...apps] });
}

/** What the server says it set up (all of it from its settings, Claude alone from its health); null forgets one (not known). */
export function setServerFeatures(features: { readonly [F in ServerFeature]?: boolean | null }): void {
  const current = useSettingsStore.getState().serverFeatures;
  const next: { [F in ServerFeature]?: boolean } = {};
  for (const feature of SERVER_FEATURES) {
    const said = feature in features ? features[feature] : current[feature];
    if (typeof said === 'boolean') next[feature] = said;
  }
  if (SERVER_FEATURES.every(feature => next[feature] === current[feature])) return;
  save({ serverFeatures: next });
}
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
  // Another server runs other apps and sets up other services: forget what this one said.
  const next = config ? normalizeServer(config) : null;
  const same = next !== null && next.url === useSettingsStore.getState().server?.url;
  save(next ? { server: next, ...(same ? {} : { serverApps: null, serverFeatures: {} }) } : { server: null, serverApps: null, serverFeatures: {} });
}

/** Test seam. */
export function resetSettings(): void {
  useSettingsStore.setState(DEFAULTS, true);
  suiteLook = { theme: DEFAULTS.theme, appearance: DEFAULTS.appearance };
}
