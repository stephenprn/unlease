/** Device settings, persisted as JSON preferences; never synced (a token belongs to a device). */
import { create } from 'zustand';

import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@unlease/design/appearance';
import { isLocale, setLocale, type Locale } from '@unlease/core/i18n';
import { isClaudeModel, parsePagesAsk, type ClaudeModel, type PagesAskSettings, type ServerSettings } from '@unlease/core/sync/settings';
import { readPreferences, writePreference } from '@data/repositories/stateRepository';
import { deviceLanguage } from '@platform/locale';

export type ThemePreference = 'system' | 'light' | 'dark';
export type BoardLayout = 'wall' | 'list';

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
   * Whether the server reads links, as last heard. Null until it has answered once:
   * a link saved meanwhile goes as pending and the server decides.
   */
  readonly reading: boolean | null;
  /** Seerr's address as the server last gave it ('' when not linked): its module shows on films and series. */
  readonly seerr: string;
  /** The Claude model the server last said it reads with: what a module's cost is shown at. */
  readonly model: ClaudeModel;
  /** The questions about the pages, as the server last said: « Demander à Claude » shows on the pages when they are on. */
  readonly pagesAsk: PagesAskSettings | null;
  /** The paper's tooth on every sheet and note (widgets keep theirs); the ground's film grain is the appearance's. */
  readonly grain: boolean;
  /** The colours and the ground on this device (`design/appearance`). */
  readonly appearance: Appearance;
  /** The interface's language. */
  readonly locale: Locale;
}

const DEFAULTS: SettingsState = {
  theme: 'system',
  layout: 'wall',
  server: null,
  onboarded: false,
  reading: null,
  seerr: '',
  model: 'claude-opus-5-5',
  pagesAsk: null,
  grain: true,
  appearance: DEFAULT_APPEARANCE,
  locale: 'fr',
};

export const useSettingsStore = create<SettingsState>(() => DEFAULTS);

export const selectThemePreference = (s: SettingsState): ThemePreference => s.theme;
export const selectLayout = (s: SettingsState): BoardLayout => s.layout;
export const selectServer = (s: SettingsState): ServerConfig | null => s.server;
export const selectOnboarded = (s: SettingsState): boolean => s.onboarded;
export const selectReading = (s: SettingsState): boolean | null => s.reading;
export const selectGrain = (s: SettingsState): boolean => s.grain;
export const selectAppearance = (s: SettingsState): Appearance => s.appearance;
export const selectLocale = (s: SettingsState): Locale => s.locale;
/** Links get read: a server is connected and has not said it lacks a key (unknown counts as yes). */
export const selectCanRead = (s: SettingsState): boolean => s.server !== null && s.reading !== false;
export const selectSeerr = (s: SettingsState): boolean => s.server !== null && s.seerr !== '';
export const selectSeerrUrl = (s: SettingsState): string => (s.server ? s.seerr : '');
export const selectModel = (s: SettingsState): ClaudeModel => s.model;
/** What a page's « Demander à Claude » may do, once the server offers it and Claude has a key; null: the pages show nothing of it. */
export const selectPagesAsk = (s: SettingsState): PagesAskSettings | null => (s.server !== null && s.reading === true && s.pagesAsk?.enabled ? s.pagesAsk : null);

function isServer(value: unknown): value is ServerConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerConfig).url === 'string' &&
    typeof (value as ServerConfig).token === 'string'
  );
}

export function loadSettings(): void {
  const stored = readPreferences();
  useSettingsStore.setState({
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
    layout: stored.layout === 'list' ? 'list' : 'wall',
    server: isServer(stored.server) && stored.server.url ? stored.server : null,
    onboarded: stored.onboarded === true,
    reading: typeof stored.reading === 'boolean' ? stored.reading : null,
    seerr: typeof stored.seerr === 'string' ? stored.seerr : '',
    model: isClaudeModel(stored.model) ? stored.model : DEFAULTS.model,
    pagesAsk: typeof stored.pagesAsk === 'object' && stored.pagesAsk !== null ? parsePagesAsk(stored.pagesAsk) : null,
    grain: stored.grain !== false,
    // The one grain switch of before also held the ground's: it carries over until the ground has its own.
    appearance: parseAppearance(stored.appearance, stored.grain !== false),
    // Until one is chosen: French on a phone set in French, English otherwise.
    locale: isLocale(stored.locale) ? stored.locale : deviceLanguage().toLowerCase().startsWith('fr') ? 'fr' : 'en',
  });
  setLocale(useSettingsStore.getState().locale);
}

function save<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void {
  writePreference(key, value);
  useSettingsStore.setState({ [key]: value } as Pick<SettingsState, K>);
}

export const setTheme = (theme: ThemePreference): void => save('theme', theme);
export const setLayout = (layout: BoardLayout): void => save('layout', layout);
export const setOnboarded = (): void => save('onboarded', true);
export const setReading = (reading: boolean | null): void => save('reading', reading);

/** What the server said of itself, remembered for the next start: whether it reads links, whether Seerr is linked, the questions about the pages. */
export function rememberServerSettings(settings: ServerSettings): void {
  setReading(settings.analysis.enabled);
  save('seerr', settings.seerr.url);
  save('model', settings.analysis.model);
  save('pagesAsk', settings.pages);
}
export const setGrain = (grain: boolean): void => save('grain', grain);
/** The colours and the ground, applied at once on every screen. */
export const setAppearance = (appearance: Appearance): void => save('appearance', appearance);

export function setInterfaceLocale(locale: Locale): void {
  setLocale(locale);
  save('locale', locale);
}

export function setServer(config: ServerConfig | null): void {
  if (!config) {
    save('server', null);
    save('reading', null);
    save('seerr', '');
    save('pagesAsk', null);
    return;
  }
  const url = config.url.trim().replace(/\/+$/, '');
  save('server', { url: /^https?:\/\//.test(url) ? url : `https://${url}`, token: config.token.trim() });
}
