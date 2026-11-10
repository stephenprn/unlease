/**
 * The suite and its apps, written out once: ESLint refuses the names anywhere else. Every program
 * knows every app, installed or not, so a link into an app this server does not run still reads as
 * one of the suite's. An app's own constants (Carnet's `APP_NAME`) come from here.
 *
 * An app is `ready` (its server module and its clients ship) or `soon` (announced: listed in the
 * setup and the app switcher as « Bientôt disponible », never turned on). The server runs the ready
 * apps its Administration turned on (`ServerSettings.apps`); their data is kept whatever is on.
 */
export const SUITE_NAME = 'Unlease';

/** Names the server's database, its archives and the S3 prefix: it must never change once a server holds data. */
export const SUITE_SLUG = 'unlease';

/** Where someone without a server yet learns to run one: the project's own guide (a fork points it at its own). */
export const SELF_HOSTING_GUIDE = 'https://github.com/stephenprn/unlease/blob/main/docs/SELF-HOSTING.md';

/** Where the phone apps are downloaded: the project's releases (a fork points it at its own). */
export const RELEASES_PAGE = 'https://github.com/stephenprn/unlease/releases/latest';

export type AppStatus = 'ready' | 'soon';

export interface AppInfo {
  /** The same in every language. */
  readonly name: string;
  /** Names the app's databases and its browser storage: it never changes once a device holds data. */
  readonly slug: string;
  /** Its phone links (`carnet://note/<id>`), the Android app's own. */
  readonly scheme: string;
  readonly status: AppStatus;
  /** The apps whose records it shows too (Pages' embeds of Carnet's collections, its mentions of contacts): its clients sync their types. */
  readonly reads: readonly string[];
}

/** Keyed by what each app does, so a rename touches only `name`. Append only: the keys are stored. */
export const APPS = {
  notes: { name: 'Carnet', slug: 'carnet', scheme: 'carnet', status: 'ready', reads: ['contacts', 'calendar'] },
  pages: { name: 'Pages', slug: 'pages', scheme: 'unlease-pages', status: 'ready', reads: ['notes', 'contacts', 'calendar'] },
  calendar: { name: 'Agenda', slug: 'agenda', scheme: 'unlease-agenda', status: 'ready', reads: ['contacts', 'notes', 'pages'] },
  contacts: { name: 'Contacts', slug: 'contacts', scheme: 'unlease-contacts', status: 'ready', reads: [] },
} as const satisfies Readonly<Record<string, AppInfo>>;

export type AppId = keyof typeof APPS;

export const APP_IDS = Object.keys(APPS) as readonly AppId[];

/** The apps a server can run today, in the suite's order. */
export const READY_APPS = APP_IDS.filter(id => APPS[id].status === 'ready');

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && Object.hasOwn(APPS, value);
}

/** An app a server can turn on. */
export function isReadyApp(value: unknown): value is AppId {
  return isAppId(value) && APPS[value].status === 'ready';
}

/** The apps an app's clients sync: itself, and those it reads. */
export function appsShownBy(id: AppId): readonly AppId[] {
  return [id, ...(APPS[id].reads as readonly string[]).filter(isAppId)];
}
