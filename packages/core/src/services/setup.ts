/**
 * The first run, shared by every client of the suite (the web app, each phone app), short on purpose:
 *
 * 1. `server`: the language, and one decision: connect to the server (its address, filled in when the
 *    server serves this page or a sibling phone app knows it, and its token), or keep everything on this
 *    device.
 * 2. Only on a server whose own setup is not done (`ServerSettings.setup`), the server's steps, done
 *    once for every app and every device: `apps` (which apps it runs; announced ones shown, not
 *    tickable), then `checklist` (« Votre serveur »: what the Administration sets, only what the chosen
 *    apps use, each row optional and opened on its own: a backup to bring back first when the server
 *    holds nothing, Claude, S3, Seafile, Seerr). Finishing marks the server set up.
 * 3. `import`: only for an app with an import whose records are none yet (on the server, or on this
 *    device keeping everything to itself), its own wizard (`importFlow.ts`), skipped with « Plus
 *    tard » (Réglages › Données keeps it).
 * 4. `appearance`: this device's colours and ground (kept with « Garder l’apparence d’origine »:
 *    `isDefaultAppearance`; a phone app starts from its sibling's).
 *
 * A device joining a server already set up goes from its colours straight to its app (by way of the
 * import when its app holds nothing there yet).
 */
import { APP_IDS, APPS, SUITE_NAME, SUITE_SLUG, isReadyApp, type AppId } from '../apps';
import { APP_WORDS } from '../appWords';
import { localized, t, tx } from '../i18n';
import type { AdminStatus } from '../sync/admin';
import { BACKUP_RECURRENCE_NAMES, CLAUDE_MODEL_NAMES, type BackupPatch, type ServerSettings } from '../sync/settings';
import { restoreSummary } from './admin';

export type SetupStep = 'server' | 'apps' | 'checklist' | 'import' | 'appearance';

/** What "Votre serveur" lists, each opened from its row. */
export type SetupTask = 'restore' | 'reading' | 'backup' | 'drive' | 'seerr' | 'immich' | 'holidays';

export interface SetupStepWords {
  readonly title: string;
  /** In the progress row. */
  readonly short: string;
  readonly lead: string;
}

export const SETUP_WORDS: Record<SetupStep, SetupStepWords> = {
  server: localized({
    title: tx('Connection'),
    short: tx('Connection'),
    lead: tx('Your notes, your pages, your contacts and your calendar, on your own server.'),
  }),
  apps: localized({
    title: tx('Your apps'),
    short: tx('Apps'),
    lead: tx('Choose what your server runs. The apps share your settings, your look and your data; you can add or remove some later in Administration.'),
  }),
  checklist: localized({
    title: tx('Your server'),
    short: tx('Server'),
    lead: tx('What more your server can do, set once for every app. All of it is optional, and can also be set later in Administration.'),
  }),
  import: localized({
    title: tx('Your data'),
    short: tx('Data'),
    lead: tx('Coming from another app? Import your data now, or later from Settings. Nothing is written before you have seen it all.'),
  }),
  appearance: localized({
    title: tx('Appearance'),
    short: tx('Appearance'),
    lead: tx('The apps’ colours and background on this device. Keep the original ones or choose your own: you can change them later in Settings.'),
  }),
};

/** The welcome's line under the brand: the suite's on the web, the app's own on a phone app. */
export function setupWelcomeLead(app: AppId | null): string {
  return app ? APP_WORDS[app].description : SETUP_WORDS.server.lead;
}

/** What the connection's fields say under them: where each value comes from. */
export function setupFieldHelp(field: 'address' | 'served' | 'token'): string {
  switch (field) {
    case 'address':
      return t('The address where you installed {suite}, for example https://{slug}.example.org.', { suite: SUITE_NAME, slug: SUITE_SLUG });
    case 'served':
      return t('This page’s address: your server is serving it.');
    case 'token':
      return t('The value of UNLEASE_TOKEN, in the .env file next to docker-compose.yml on your server.');
  }
}

export const SETUP_TASK_WORDS: Record<SetupTask, Omit<SetupStepWords, 'short'>> = {
  restore: localized({
    title: tx('Recover your data'),
    lead: tx('Your server is empty. If it replaces another one, restore its latest backup: every app’s data comes back from S3, the files from Seafile. Otherwise, start afresh.'),
  }),
  reading: localized({
    title: tx('Claude'),
    lead: tx('Optional: a Claude key, shared by every app. Create one on console.anthropic.com, under API Keys; the monthly budget stops everything once reached.'),
  }),
  backup: localized({
    title: tx('Backup to S3'),
    lead: tx('A copy of every app’s data away from home, at Scaleway, OVH, AWS… and of your photos and files, unless Seafile keeps them. Create the key in your provider’s console (access keys, or IAM); it is checked (read, write, delete) then kept on your server.'),
  }),
  drive: localized({
    title: tx('Files on Seafile'),
    lead: tx('Optional: every app’s photos, videos and documents filed in a Seafile folder, each app in its own; the server keeps only previews. Without Seafile, it keeps them, and the S3 backup has a copy.'),
  }),
  holidays: localized({
    title: tx('Public holidays'),
    lead: tx('Optional, for Agenda: a country’s public holidays (and its region’s, if it has any), which the server fetches from Nager.Date and shows in every device’s calendar.'),
  }),
  seerr: localized({
    title: tx('Films and series with Seerr'),
    lead: tx('Optional, for collections of films and series: your Seerr (Jellyseerr, Overseerr), to request a title from its link. Its API key is in Seerr, Settings, General.'),
  }),
  immich: localized({
    title: tx('Photos on Immich'),
    lead: tx('Optional: your Immich photo library, to show an album or photos in a page and take a contact’s photo from the faces it knows. Create an API key in Immich, Account Settings, API Keys, with album.read, asset.read, asset.view and person.read.'),
  }),
};

/** What « Retrouver vos données » says as it goes, the same on every client. */
export const SETUP_RESTORE_WORDS = localized({
  noStorage: tx('No S3 storage'),
  noStorageMeta: tx('Add it to find its backups. Without S3, an archive downloaded before can still come back.'),
  addStorage: tx('Add S3 storage'),
  reading: tx('Reading the backups on S3…'),
  unreadable: tx('Backups unreadable'),
  none: tx('No backups on S3'),
  restore: tx('Restore this backup'),
  running: tx('Restoring…'),
  runningMeta: tx('The data comes back first, then photos and files.'),
  failed: tx('The restore failed'),
  back: tx('Your data is back'),
  file: tx('Restore from a file'),
  fileMeta: tx('A .tar.gz archive downloaded from S3 or from the Administration.'),
  refused: tx('Restore refused'),
});

/** « Aucune sauvegarde sur S3 »'s line: where the server looked. */
export function setupNoBackupsMeta(bucket: string, prefix: string): string {
  return t('Nothing to restore in {place}.', { place: `${bucket}${prefix ? `/${prefix.replace(/\/$/, '')}` : ''}` });
}

/** A row's title and lead as the server stands: once a backup came back, its lead no longer calls the server empty. */
export function setupTaskWords(task: SetupTask, status: AdminStatus | null): Omit<SetupStepWords, 'short'> {
  const words = SETUP_TASK_WORDS[task];
  if (task !== 'restore' || !setupRestored(status)) return words;
  return { ...words, lead: t('The backup’s data is back on this server. You can restore another one, or carry on.') };
}

/** What Claude does for an app, in the Claude form of the setup and the Administration; null for an app that does not ask it. */
export function claudeUse(app: AppId): string | null {
  const name = APPS[app].name;
  switch (app) {
    case 'notes':
      return t('{app}: each saved link is read (title, price, summary, pictures) and filed in the right collection.', { app: name });
    case 'pages':
      return t('{app}: questions about your pages, which Claude answers citing the passages.', { app: name });
    case 'calendar':
      return t('{app}: an event typed in a few words, an event drawn from a saved link, questions about your calendar.', { app: name });
    default:
      return null;
  }
}

/** The server holds nothing yet: a new one, or one to bring back from a backup. */
export function serverEmpty(status: AdminStatus | null): boolean {
  return status !== null && status.server.notes === 0 && status.server.pages === 0 && status.server.contacts === 0 && status.server.events === 0 && status.server.files === 0;
}

/**
 * Whether the server started empty, read from its status when the setup resumes (the app reopened
 * mid-setup): a restore running on it counts, so its row stays.
 */
export function setupStartedEmpty(status: AdminStatus | null): boolean {
  return serverEmpty(status) || status?.restore.running === true;
}

/** A restore has come back well on the server. */
export function setupRestored(status: AdminStatus | null): boolean {
  return status !== null && !status.restore.running && status.restore.report !== null && status.restore.error === null;
}

/**
 * Whether this device sets the server up (the apps, « Votre serveur »): connected to a server whose
 * own setup is not done, or not known yet. Once it is, every other device skips it.
 */
export function setupServerShown(connected: boolean, serverDone: boolean | null): boolean {
  return connected && serverDone !== true;
}

/**
 * The steps, in order: the server (or this device alone), the server's own when this device sets it
 * up, the import when the app has one and holds nothing yet (`setupImportShown`), then how the apps
 * look here.
 */
export function setupSteps(connected: boolean, serverSetup: boolean, importShown = false): SetupStep[] {
  const steps: SetupStep[] = connected && serverSetup ? ['server', 'apps', 'checklist'] : ['server'];
  if (importShown) steps.push('import');
  steps.push('appearance');
  return steps;
}

/** The server's count of an app's records (`AdminStatus.server`), for an app that has one. */
const APP_COUNTS: Partial<Record<AppId, 'notes' | 'pages' | 'contacts' | 'events'>> = { notes: 'notes', pages: 'pages', contacts: 'contacts', calendar: 'events' };

/**
 * Whether the first run offers the app's import: it has one, and holds nothing yet: on the server, as
 * its status counts (null while unknown: not offered, rather than offered then taken back), or, with
 * no server, on this device, which a first run finds empty.
 */
export function setupImportShown(app: AppId, hasImport: boolean, connected: boolean, status: AdminStatus | null): boolean | null {
  if (!hasImport) return false;
  if (!connected) return true;
  if (status === null) return null;
  const key = APP_COUNTS[app];
  return key ? status.server[key] === 0 : false;
}

/** The apps that use a task: Claude for those that ask it, Seerr for Carnet; S3, Seafile and a restore for all. */
const TASK_APPS: Partial<Record<SetupTask, readonly AppId[]>> = { reading: ['notes', 'pages', 'calendar'], seerr: ['notes'], immich: ['pages', 'contacts'], holidays: ['calendar'] };

/** "Votre serveur"'s rows, in order: a backup to bring back first (only on a server that held nothing), then Claude, S3, Seafile, Seerr, Immich, those the apps on use. */
export function setupTasks(startedEmpty: boolean, apps: readonly AppId[]): SetupTask[] {
  const all: SetupTask[] = ['restore', 'reading', 'backup', 'drive', 'seerr', 'immich', 'holidays'];
  return all.filter(task => (task === 'restore' ? startedEmpty : (TASK_APPS[task] ?? APP_IDS).some(id => apps.includes(id))));
}

/** One card of the apps step. */
export interface SetupAppChoice {
  readonly id: AppId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly replaces: string;
  /** Announced, not installable yet: shown with « Bientôt disponible ». */
  readonly soon: boolean;
  readonly checked: boolean;
  /** The app this device is (a phone app): it stays on. */
  readonly locked: boolean;
}

/** Every app of the suite as the apps step shows it, ready ones first. */
export function setupAppChoices(enabled: readonly AppId[], own: AppId | null): SetupAppChoice[] {
  return APP_IDS.map(id => ({
    id,
    name: APPS[id].name,
    ...APP_WORDS[id],
    soon: !isReadyApp(id),
    checked: isReadyApp(id) && enabled.includes(id),
    locked: id === own,
  }));
}

/** The apps on after ticking or unticking one: never an announced one, never the device's own, never none. */
export function toggleSetupApp(enabled: readonly AppId[], id: AppId, own: AppId | null): readonly AppId[] {
  if (!isReadyApp(id) || id === own) return enabled;
  const next = enabled.includes(id) ? enabled.filter(each => each !== id) : [...enabled, id];
  const ordered = APP_IDS.filter(each => next.includes(each));
  return ordered.length > 0 ? ordered : enabled;
}

/** The task's setting is in place (a restore, once it came back well). */
export function setupTaskSet(task: SetupTask, settings: ServerSettings | null, status: AdminStatus | null): boolean {
  switch (task) {
    case 'restore':
      return setupRestored(status);
    case 'reading':
      return settings?.analysis.enabled === true;
    case 'backup':
      return settings?.backup.configured === true;
    case 'drive':
      return settings !== null && settings.drive.provider !== null;
    case 'seerr':
      return settings !== null && settings.seerr.url !== '';
    case 'immich':
      return settings !== null && settings.immich.url !== '';
    case 'holidays':
      return settings !== null && settings.calendar.holidays.country !== null;
  }
}

/**
 * The forward button's words at the foot of a step: the last one opens the app. Nothing is skipped
 * on the appearance step, what it shows is kept: left as it came, it says so.
 */
export function setupForward(step: SetupStep, set: boolean, last: boolean): string {
  if (last) return t('Start');
  if (step === 'appearance' && !set) return t('Keep the original look');
  if (step === 'import' && !set) return t('Later');
  return t('Continue');
}

/** The forward button of a task opened from "Votre serveur": back to the list, done or left for later. */
export function setupTaskForward(set: boolean): string {
  return set ? t('Continue') : t('Later');
}

/** "Étape 2 sur 4". */
export function setupProgress(steps: readonly SetupStep[], step: SetupStep): string {
  return t('Step {step} of {count}', { step: steps.indexOf(step) + 1, count: steps.length });
}

/** The step after `step` (itself at the end). */
export function nextSetupStep(steps: readonly SetupStep[], step: SetupStep): SetupStep {
  const index = steps.indexOf(step);
  return steps[Math.min(steps.length - 1, index + 1)] ?? step;
}

/** The step before `step` (itself at the start). */
export function previousSetupStep(steps: readonly SetupStep[], step: SetupStep): SetupStep {
  const index = steps.indexOf(step);
  return steps[Math.max(0, index - 1)] ?? step;
}

/** A phone app finding its sibling's connection on the welcome: the one tap that saves typing it. */
export function siblingConnectionWords(app: AppId, server: string): { readonly action: string; readonly note: string } {
  const name = APPS[app].name;
  return { action: t('Use {app}’s connection', { app: name }), note: t('{app} is already connected to {server} on this phone.', { app: name, server: server.replace(/^https?:\/\//, '') }) };
}

/** The appearance step's note when it starts from a sibling phone app's colours. */
export function siblingAppearanceNote(app: AppId): string {
  return t('The colours of {app} on this phone, taken up here.', { app: APPS[app].name });
}

/** What a client shows when its app is off on the server it connects to. */
export function appOffWords(app: AppId): { readonly title: string; readonly lead: string; readonly action: string } {
  const name = APPS[app].name;
  return {
    title: t('{app} is not turned on on this server', { app: name }),
    lead: t('Your server doesn’t run {app} for now. Turn it on to use it here: nothing else changes, and its data is kept even while it is off.', { app: name }),
    action: t('Turn on {app}', { app: name }),
  };
}

/** What the connection's fields say once left empty, or sent so (null: filled). */
export function connectionProblem(field: 'address' | 'token', value: string): string | null {
  if (value.trim()) return null;
  return field === 'address' ? t('Enter your server’s address.') : t('Enter your server’s token.');
}

/** What is wrong with a Claude key typed: nothing pasted, or too short to be one (null: it may be one; the server tries it). */
export function claudeKeyProblem(key: string): string | null {
  const typed = key.trim();
  if (!typed) return t('Paste your Claude API key.');
  return typed.length < 20 ? t('This key is too short: paste all of it, it starts with sk-ant-.') : null;
}

/**
 * What is wrong with the address of a service typed (S3, Seafile, Seerr): `missing` when empty, else
 * when it is not a web address, how one reads, with `example`.
 */
export function serviceAddressProblem(address: string, missing: string, example: string): string | null {
  const typed = address.trim();
  if (!typed) return missing;
  return /^https?:\/\/[^\s/]+\S*$/i.test(typed) ? null : t('An address starting with https:// or http://, like {example}.', { example });
}

/** A field of a service's form (S3, Seafile, Seerr) that the server's refusal can point at. */
export type ServiceField = 'address' | 'region' | 'bucket' | 'key';

/**
 * The server's refusals of a service, by the field they concern, as it sends them: in English, or in
 * French from a server older than English keys.
 */
const SERVICE_REFUSALS: Readonly<Record<string, ServiceField>> = {
  'S3 storage unreachable': 'address',
  'Seafile unreachable': 'address',
  'Seerr unreachable': 'address',
  'This address does not answer like a Seafile server': 'address',
  'This address does not answer like a Seerr server': 'address',
  'This address redirects elsewhere: give the one Seerr answers on': 'address',
  'Immich unreachable': 'address',
  'Invalid Immich address': 'address',
  'This address does not answer like an Immich server': 'address',
  'This address redirects elsewhere: give the one Immich answers on': 'address',
  'API key refused by Immich': 'key',
  'This API key lacks a permission: give it album.read, asset.read, asset.view and person.read': 'key',
  'Bucket not found': 'bucket',
  'Wrong region for this bucket': 'region',
  'Token refused by Seafile': 'key',
  'This token is read-only: it needs read and write access': 'key',
  'This token opens another library: turn Seafile off first to bring your files back': 'key',
  'API key refused by Seerr': 'key',
  'Stockage S3 injoignable': 'address',
  'Seafile injoignable': 'address',
  'Seerr injoignable': 'address',
  'Cette adresse ne répond pas comme un serveur Seafile': 'address',
  'Cette adresse ne répond pas comme un serveur Seerr': 'address',
  'Cette adresse renvoie ailleurs : donnez celle où Seerr répond': 'address',
  'Bucket introuvable': 'bucket',
  'Mauvaise région pour ce bucket': 'region',
  'Jeton refusé par Seafile': 'key',
  'Ce jeton est en lecture seule : il faut la lecture et l’écriture': 'key',
  'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers': 'key',
  'Clé API refusée par Seerr': 'key',
};

/**
 * Which field the server's refusal of a service points at, so it shows under it: the address it could
 * not reach or that is not the service's, the bucket or the region S3 refused, the key or token refused.
 * null: the whole form (both S3 keys together, rights, an error of the service's).
 */
export function serviceRefusalField(message: string): ServiceField | null {
  return SERVICE_REFUSALS[message] ?? null;
}

/** Which field a failed connection points at: the token when the server refused it (or too many tries with it), else the address. */
export function connectFailureField(kind: string, status: number | null): 'address' | 'token' {
  return kind === 'unauthorized' || status === 429 ? 'token' : 'address';
}

/** A failed connection's words: when nothing answered at all, what to check comes with them. */
export function connectFailureMessage(kind: string, message: string): string {
  const silent = kind === 'network' && (message === t('Server unreachable') || message === t('The server isn’t responding'));
  return silent ? t('{problem}: check the address, and that the server is running.', { problem: message }) : message;
}

/** What the backup form starts from on a new setup: Scaleway in Paris, a folder named after the suite, as the drive's. */
export const SETUP_BACKUP_DRAFT: Pick<BackupPatch, 'endpoint' | 'region' | 'prefix'> = {
  endpoint: 'https://s3.fr-par.scw.cloud',
  region: 'fr-par',
  prefix: SUITE_SLUG,
};

/**
 * The region an S3 address names, for the region field: `fr-par` from `https://s3.fr-par.scw.cloud`,
 * `eu-west-3` from `https://s3.eu-west-3.amazonaws.com`, `gra` from `https://s3.gra.io.cloud.ovh.net`.
 */
export function regionOfEndpoint(endpoint: string): string | null {
  let host: string;
  try {
    host = new URL(endpoint.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  const match = /^s3[.-]([a-z0-9-]+)\.(?:scw\.cloud|amazonaws\.com|io\.cloud\.ovh\.net|cloud\.ovh\.net)$/.exec(host);
  return match ? match[1]! : null;
}

/** A country's name in the interface's language when this build knows it (`FR` -> « France »), else its code. */
export function countryName(code: string): string {
  const name = COUNTRY_NAMES[code];
  return name ? t(name) : code;
}

/** The countries Nager.Date has holidays for that people pick most, by name; any other is its code. */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  FR: tx('France'),
  BE: tx('Belgium'),
  CH: tx('Switzerland'),
  LU: tx('Luxembourg'),
  CA: tx('Canada'),
  GB: tx('United Kingdom'),
  IE: tx('Ireland'),
  US: tx('United States'),
  DE: tx('Germany'),
  AT: tx('Austria'),
  ES: tx('Spain'),
  PT: tx('Portugal'),
  IT: tx('Italy'),
  NL: tx('Netherlands'),
  MC: tx('Monaco'),
  MA: tx('Morocco'),
  TN: tx('Tunisia'),
  SN: tx('Senegal'),
  AU: tx('Australia'),
  NZ: tx('New Zealand'),
  SE: tx('Sweden'),
  NO: tx('Norway'),
  DK: tx('Denmark'),
  FI: tx('Finland'),
  PL: tx('Poland'),
  GR: tx('Greece'),
  JP: tx('Japan'),
  BR: tx('Brazil'),
  MX: tx('Mexico'),
};

/** A row of "Votre serveur": the task, what it holds now (or what it would do), and whether it is in place. */
export interface SetupTaskLine {
  readonly task: SetupTask;
  readonly title: string;
  readonly meta: string;
  readonly tone: 'ok' | 'off' | 'waiting';
}

/** What a task's row says, from the server's settings and status as they are now. */
export function setupTaskLine(task: SetupTask, settings: ServerSettings | null, status: AdminStatus | null): SetupTaskLine {
  const title = SETUP_TASK_WORDS[task].title;
  const set = setupTaskSet(task, settings, status);
  const line = (meta: string, tone: SetupTaskLine['tone'] = set ? 'ok' : 'off'): SetupTaskLine => ({ task, title, meta, tone });
  switch (task) {
    case 'restore':
      if (status?.restore.running) return line(t('Restoring…'), 'waiting');
      return set && status?.restore.report ? line(restoreSummary(status.restore.report)) : line(t('The server is empty: a backup from S3 or an archive can come back.'));
    case 'reading':
      return set ? line(t('Claude {model}, for every app', { model: CLAUDE_MODEL_NAMES[settings!.analysis.model] })) : line(t('Read your links, answer about your pages.'));
    case 'backup': {
      if (!set) return line(t('A copy of everything, far from home.'));
      const { bucket, prefix, recurrence } = settings!.backup;
      return line(`${bucket}${prefix ? `/${prefix.replace(/\/$/, '')}` : ''} · ${BACKUP_RECURRENCE_NAMES[recurrence].toLowerCase()}`);
    }
    case 'drive': {
      if (!set) return line(t('Your photos and files in a Seafile folder.'));
      const { library, folder } = settings!.drive;
      return line(`${library ? t('Seafile “{library}”', { library }) : 'Seafile'}, ${folder}`);
    }
    case 'seerr':
      return set ? line(settings!.seerr.url.replace(/^https?:\/\//, '')) : line(t('Request a film or a series from its link.'));
    case 'immich':
      return set ? line(settings!.immich.url.replace(/^https?:\/\//, '')) : line(t('Your albums in pages, faces for your contacts.'));
    case 'holidays': {
      const { country, region } = settings?.calendar.holidays ?? { country: null, region: null };
      return country ? line(region ? `${countryName(country)} · ${region}` : countryName(country)) : line(t('Your country’s public holidays in the calendar.'));
    }
  }
}
