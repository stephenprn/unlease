/**
 * The device's settings, persisted as JSON preferences; never synced (a token belongs to a device).
 * With them, what the server last said of itself (whether it reads links, which apps it runs…), for
 * what is done offline and for the next start.
 */
import { create } from 'zustand';

import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from '@unlease/design/appearance';
import { isLocale, setLocale, type Locale } from '@unlease/core/i18n';
import { isAppId, type AppId } from '@unlease/core/apps';
import { isClaudeModel, parseEnabledApps, parsePagesAsk, type ClaudeModel, type PagesAskSettings, type ServerSettings } from '@unlease/core/sync/settings';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { deviceLanguage } from '@shared/platform/locale';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ServerConfig {
  /** Origin of the suite's server, e.g. `https://unlease.example.org`. */
  readonly url: string;
  readonly token: string;
}

export interface SettingsState {
  readonly theme: ThemePreference;
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
  /** The questions about the calendar, as the server last said: Agenda shows « Demander à Claude » while they are on. */
  readonly calendarAsk: boolean;
  /** The apps the server runs, as it last said; null until it has (or from a server older than the suite). */
  readonly apps: readonly AppId[] | null;
  /** The paper's tooth on every sheet and note (widgets keep theirs); the ground's film grain is the appearance's. */
  readonly grain: boolean;
  /** When either grain (the paper's, the ground's) was last chosen, in this app or another of the suite (`suiteLink`): the apps follow the latest. 0: never. */
  readonly grainAt: number;
  /** The colours and the ground on this device (`design/appearance`). */
  readonly appearance: Appearance;
  /** When this app's look (the theme, the colours, the ground) was last chosen, here or by another app of the suite that sent it (`lookOffer`): an older offer never undoes it. 0: never. */
  readonly lookAt: number;
  /** The look this app last sent to others of the suite (« Appliquer aux autres »), as it was then; null: never. */
  readonly lookOffer: LookOffer | null;
  /** The interface's language. */
  readonly locale: Locale;
  /** When the language was chosen, in this app or another of the suite (`suiteLink`): the apps follow the latest. 0: never (the phone's own), 1: before the suite shared it. */
  readonly localeAt: number;
}

const DEFAULTS: SettingsState = {
  theme: 'system',
  server: null,
  onboarded: false,
  reading: null,
  seerr: '',
  model: 'claude-opus-5-5',
  pagesAsk: null,
  calendarAsk: false,
  apps: null,
  grain: true,
  grainAt: 0,
  appearance: DEFAULT_APPEARANCE,
  lookAt: 0,
  lookOffer: null,
  locale: 'fr',
  localeAt: 0,
};

/** Both grains as one app of the suite chose them, and when: what the apps on one phone hand each other. */
export interface GrainChoice {
  /** The paper's grain (`grain`). */
  readonly paper: boolean;
  /** The ground's (`appearance.grain`). */
  readonly ground: boolean;
  /** When they were chosen (ms). */
  readonly at: number;
}

export const useSettingsStore = create<SettingsState>(() => DEFAULTS);

export const selectThemePreference = (s: SettingsState): ThemePreference => s.theme;
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
/** The apps the server runs, once it has said (`apps`); null meanwhile, and without a server. */
export const selectServerApps = (s: SettingsState): readonly AppId[] | null => (s.server ? s.apps : null);
/** The server runs this app, or has not said otherwise. */
export const selectServerRuns =
  (app: AppId) =>
  (s: SettingsState): boolean =>
    s.server === null || s.apps === null || s.apps.includes(app);
/** What a page's « Demander à Claude » may do, once the server offers it and Claude has a key; null: the pages show nothing of it. */
export const selectPagesAsk = (s: SettingsState): PagesAskSettings | null => (s.server !== null && s.reading === true && s.pagesAsk?.enabled ? s.pagesAsk : null);
/** Agenda's « Demander à Claude » shows: the server offers the questions and Claude has a key. */
export const selectCalendarAsk = (s: SettingsState): boolean => s.server !== null && s.reading === true && s.calendarAsk;

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
    server: isServer(stored.server) && stored.server.url ? stored.server : null,
    onboarded: stored.onboarded === true,
    reading: typeof stored.reading === 'boolean' ? stored.reading : null,
    seerr: typeof stored.seerr === 'string' ? stored.seerr : '',
    model: isClaudeModel(stored.model) ? stored.model : DEFAULTS.model,
    pagesAsk: typeof stored.pagesAsk === 'object' && stored.pagesAsk !== null ? parsePagesAsk(stored.pagesAsk) : null,
    calendarAsk: stored.calendarAsk === true,
    apps: parseEnabledApps(stored.apps),
    grain: stored.grain !== false,
    grainAt: typeof stored.grainAt === 'number' && Number.isFinite(stored.grainAt) ? stored.grainAt : 0,
    // The one grain switch of before also held the ground's: it carries over until the ground has its own.
    appearance: parseAppearance(stored.appearance, stored.grain !== false),
    lookAt: typeof stored.lookAt === 'number' && Number.isFinite(stored.lookAt) ? stored.lookAt : 0,
    lookOffer: readLookOffer(stored.lookOffer),
    // Until one is chosen: French on a phone set in French, English otherwise.
    locale: isLocale(stored.locale) ? stored.locale : deviceLanguage().toLowerCase().startsWith('fr') ? 'fr' : 'en',
    localeAt: typeof stored.localeAt === 'number' && Number.isFinite(stored.localeAt) ? stored.localeAt : isLocale(stored.locale) ? 1 : 0,
  });
  setLocale(useSettingsStore.getState().locale);
}

function save<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void {
  writePreference(key, value);
  useSettingsStore.setState({ [key]: value } as Pick<SettingsState, K>);
}

/** This app's theme (the others keep theirs until it is sent to them, `applyLookTo`). */
export function setTheme(theme: ThemePreference): void {
  save('theme', theme);
  save('lookAt', Date.now());
}
export const setOnboarded = (): void => save('onboarded', true);
export const setReading = (reading: boolean | null): void => save('reading', reading);

/** What the server said of itself, remembered for the next start: whether it reads links, whether Seerr is linked, the questions about the pages and the calendar, the apps it runs. */
export function rememberServerSettings(settings: ServerSettings): void {
  setReading(settings.analysis.enabled);
  save('seerr', settings.seerr.url);
  save('model', settings.analysis.model);
  save('pagesAsk', settings.pages);
  save('calendarAsk', settings.calendar.ask);
  setServerApps(settings.apps.enabled);
}

/** The apps the server runs, as its health or its settings said. */
export function setServerApps(apps: readonly AppId[] | null): void {
  const current = useSettingsStore.getState().apps;
  if (current === apps || (current && apps && current.join() === apps.join())) return;
  save('apps', apps);
}
/** The paper's grain, for every app of the suite on this phone (they follow the latest choice). */
export function setGrain(grain: boolean): void {
  save('grain', grain);
  save('grainAt', Date.now());
}

/** This app's colours and ground, applied at once on every screen (the others keep theirs until they are sent, `applyLookTo`; the ground's grain is the suite's, with the grains). */
export function setAppearance(appearance: Appearance): void {
  const before = useSettingsStore.getState().appearance;
  const now = Date.now();
  save('appearance', appearance);
  if (appearance.grain !== before.grain) save('grainAt', now);
  if (JSON.stringify({ ...appearance, grain: before.grain }) !== JSON.stringify(before)) save('lookAt', now);
}

/** A look as one app of the suite holds it, and when: the theme, the colours and the ground, taken whole (two choices mixed would make a look nobody picked). Its ground's grain goes with the grains (`GrainChoice`). */
export interface LookChoice {
  readonly theme: ThemePreference;
  readonly appearance: Appearance;
  readonly at: number;
}

/** A look one app sent to others of the suite (« Appliquer aux autres »): the apps it is for, each taking it unless it chose its own since. */
export interface LookOffer extends LookChoice {
  readonly to: readonly AppId[];
}

/** A look offer as kept or handed on, or null when it is none (a look without the apps it is for is none). */
export function readLookOffer(value: unknown): LookOffer | null {
  if (typeof value !== 'object' || value === null) return null;
  const { theme, appearance, at, to } = value as Record<string, unknown>;
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || typeof appearance !== 'object' || appearance === null || !Array.isArray(to)) return null;
  const apps = to.filter(isAppId);
  return apps.length > 0 ? { theme, appearance: parseAppearance(appearance), at, to: apps } : null;
}

/** This app's look, sent to `apps` (« Appliquer aux autres »): each takes it the next time it opens or comes to the front, unless it chose its own after. */
export function applyLookTo(apps: readonly AppId[]): void {
  const { theme, appearance } = useSettingsStore.getState();
  const to = apps.filter((app, index) => apps.indexOf(app) === index);
  if (to.length === 0) return;
  save('lookOffer', { theme, appearance, at: Date.now(), to });
}

/** Another app of the suite sent its look, later than this app chose its own: it becomes this app's, kept with that app's time (never stamped again, so nothing echoes back). */
export function followLook(choice: LookChoice): void {
  const state = useSettingsStore.getState();
  if (choice.at <= state.lookAt) return;
  const appearance = { ...choice.appearance, grain: state.appearance.grain };
  writePreference('theme', choice.theme);
  writePreference('appearance', appearance);
  writePreference('lookAt', choice.at);
  useSettingsStore.setState({ theme: choice.theme, appearance, lookAt: choice.at });
}

/** Another app of the suite chose its grains later than this one: they become this app's, kept with that app's time. */
export function followGrain(choice: GrainChoice): void {
  const state = useSettingsStore.getState();
  if (choice.at <= state.grainAt) return;
  const appearance = choice.ground === state.appearance.grain ? state.appearance : { ...state.appearance, grain: choice.ground };
  writePreference('grain', choice.paper);
  writePreference('appearance', appearance);
  writePreference('grainAt', choice.at);
  useSettingsStore.setState({ grain: choice.paper, appearance, grainAt: choice.at });
}

/** The interface's language, for every app of the suite on this phone (they follow the latest choice). */
export function setInterfaceLocale(locale: Locale): void {
  setLocale(locale);
  save('locale', locale);
  save('localeAt', Date.now());
}

/** The language as one app of the suite chose it, and when. */
export interface LocaleChoice {
  readonly locale: Locale;
  readonly at: number;
}

/** Another app of the suite chose its language later than this one: it becomes this app's, kept with that app's time. */
export function followLocale(choice: LocaleChoice): void {
  const state = useSettingsStore.getState();
  if (choice.at <= state.localeAt) return;
  writePreference('localeAt', choice.at);
  if (choice.locale === state.locale) {
    useSettingsStore.setState({ localeAt: choice.at });
    return;
  }
  setLocale(choice.locale);
  writePreference('locale', choice.locale);
  useSettingsStore.setState({ locale: choice.locale, localeAt: choice.at });
}

export function setServer(config: ServerConfig | null): void {
  if (!config) {
    save('server', null);
    save('reading', null);
    save('seerr', '');
    save('pagesAsk', null);
    save('calendarAsk', false);
    save('apps', null);
    return;
  }
  const url = config.url.trim().replace(/\/+$/, '');
  const origin = /^https?:\/\//.test(url) ? url : `https://${url}`;
  // Another server says for itself which apps it runs.
  if (useSettingsStore.getState().server?.url !== origin) save('apps', null);
  save('server', { url: origin, token: config.token.trim() });
}
