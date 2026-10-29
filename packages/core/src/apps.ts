/**
 * The suite and its apps, written out once: ESLint refuses the names anywhere else. Every program
 * knows every app, installed or not, so a link into an app this server does not run still reads as
 * one of the suite's. An app's own constants (Carnet's `APP_NAME`) come from here.
 */
export const SUITE_NAME = 'Unlease';

/** Names the server's database, its archives and the S3 prefix: it must never change once a server holds data. */
export const SUITE_SLUG = 'unlease';

/** Where someone without a server yet learns to run one: the project's own guide (a fork points it at its own). */
export const SELF_HOSTING_GUIDE = 'https://github.com/stephenprn/unlease/blob/main/docs/SELF-HOSTING.md';

export interface AppInfo {
  /** The same in every language. */
  readonly name: string;
  /** Names the app's databases, its browser storage and its phone links (`carnet://`): it never changes once a device holds data. */
  readonly slug: string;
}

/** Keyed by what each app does, so a rename touches only `name`. Append only: the keys are stored. */
export const APPS = {
  notes: { name: 'Carnet', slug: 'carnet' },
} as const satisfies Readonly<Record<string, AppInfo>>;

export type AppId = keyof typeof APPS;

export const APP_IDS = Object.keys(APPS) as readonly AppId[];

export function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && Object.hasOwn(APPS, value);
}
