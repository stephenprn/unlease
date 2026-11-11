/**
 * Server settings set from the apps' Administration: link reading by Claude and questions about
 * the pages, the backup to S3, the drive that holds the files (Seafile) and Seerr for the films and series modules. Keys and secrets are set from the apps, never from
 * source, and never come back: only their last characters do.
 * `GET /api/settings` -> ServerSettings; `PUT` a SettingsPatch -> the same, or 400/502 { error }.
 */

import { isReadyApp, READY_APPS, SUITE_NAME, type AppId } from '../apps';
import { localized, tx } from '../i18n';

/** Where a Claude API key is made: linked from the key's field. */
export const ANTHROPIC_CONSOLE = { url: 'https://console.anthropic.com/settings/keys', name: 'console.anthropic.com' } as const;

/** The models the apps offer, cheapest last. */
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

export const CLAUDE_MODEL_NAMES: Record<ClaudeModel, string> = {
  'claude-opus-5-5': 'Opus 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-haiku-5-5': 'Haiku 5.5',
};

/** US dollars per link read, rounded up: a full page (about 6 000 tokens in with its picture, 600 out) at the list prices in server/src/apps/notes/analysis/pricing.ts. */
export const CLAUDE_COST_PER_LINK: Record<ClaudeModel, number> = {
  'claude-opus-5-5': 0.04,
  'claude-sonnet-5-5': 0.02,
  'claude-haiku-5-5': 0.001,
};

/** US dollars per module's search on the web (promo codes, other shops, second-hand), a guess rounded up and not yet measured: up to five web searches ($0.01 each) and what they bring back (about 30 000 tokens in, 3 000 out). */
export const CLAUDE_COST_PER_WEB_SEARCH: Record<ClaudeModel, number> = {
  'claude-opus-5-5': 0.25,
  'claude-sonnet-5-5': 0.12,
  'claude-haiku-5-5': 0.05,
};

/** US dollars per question to Claude about a link without the web, a guess rounded up: the page read once (about 8 000 tokens in, 600 out). */
export const CLAUDE_COST_PER_QUESTION: Record<ClaudeModel, number> = {
  'claude-opus-5-5': 0.05,
  'claude-sonnet-5-5': 0.03,
  'claude-haiku-5-5': 0.005,
};

/** How much of the pages one question may send Claude: a short, medium or long read. */
export const PAGES_REACHES = ['short', 'medium', 'long'] as const;
export type PagesReach = (typeof PAGES_REACHES)[number];

/** Characters of pages one question may send, by reach (a French word is about six). */
export const PAGES_REACH_CHARS: Record<PagesReach, number> = { short: 40_000, medium: 120_000, long: 400_000 };

export const PAGES_REACH_NAMES: Record<PagesReach, string> = localized({
  short: tx('Courte'),
  medium: tx('Moyenne'),
  long: tx('Longue'),
});

export function isPagesReach(value: unknown): value is PagesReach {
  return typeof value === 'string' && (PAGES_REACHES as readonly string[]).includes(value);
}

/** US dollars per million tokens in and out, the list prices of server/src/apps/notes/analysis/pricing.ts: what a question's cost is estimated at. */
export const CLAUDE_RATES: Record<ClaudeModel, { readonly input: number; readonly output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/** How often the server backs up to S3 on its own. */
export const BACKUP_RECURRENCES = ['off', '6h', 'daily', 'weekly'] as const;
export type BackupRecurrence = (typeof BACKUP_RECURRENCES)[number];

export const BACKUP_RECURRENCE_NAMES: Record<BackupRecurrence, string> = localized({
  off: tx('Jamais'),
  '6h': tx('Toutes les 6 h'),
  daily: tx('Chaque jour'),
  weekly: tx('Chaque semaine'),
});

export const BACKUP_INTERVAL_MS: Record<Exclude<BackupRecurrence, 'off'>, number> = {
  '6h': 6 * 3_600_000,
  daily: 24 * 3_600_000,
  weekly: 7 * 24 * 3_600_000,
};

/** Days a snapshot stays on S3 (the newest one always does). */
export const BACKUP_KEEP_DEFAULT = 30;
export const BACKUP_KEEP_MAX = 3650;

/**
 * S3 storage classes the backups can be sent in, from the readiest to the coldest. Each provider
 * offers some (`storageClassesFor`); the bucket tries the one chosen before it is kept.
 */
export const STORAGE_CLASSES = ['STANDARD', 'STANDARD_IA', 'ONEZONE_IA', 'GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'] as const;
export type StorageClass = (typeof STORAGE_CLASSES)[number];

export function isStorageClass(value: unknown): value is StorageClass {
  return typeof value === 'string' && (STORAGE_CLASSES as readonly string[]).includes(value);
}

/** Classes whose objects sleep: S3 brings one out (a restore request, hours) before it can be read. */
export function isColdStorage(value: string | null | undefined): boolean {
  return value === 'GLACIER' || value === 'DEEP_ARCHIVE';
}

export function isBackupRecurrence(value: unknown): value is BackupRecurrence {
  return typeof value === 'string' && (BACKUP_RECURRENCES as readonly string[]).includes(value);
}

/** The drives that can hold the files. */
export const DRIVE_PROVIDERS = ['seafile'] as const;
export type DriveProvider = (typeof DRIVE_PROVIDERS)[number];

/** The folder a new drive takes, named after the suite: each app's files go in a folder of its own inside. */
export const DRIVE_FOLDER_DEFAULT = `/${SUITE_NAME}`;

export interface BackupSettings {
  /** An endpoint, a bucket and both keys are set: backups can run. */
  readonly configured: boolean;
  /** The S3 endpoint, a bare origin ("https://s3.fr-par.scw.cloud"); '' when not set. */
  readonly endpoint: string;
  /** "fr-par". */
  readonly region: string;
  readonly bucket: string;
  /** Where in the bucket, '' or ending in '/' ("carnet/"). */
  readonly prefix: string;
  /** The access key's id: not a secret, shown whole. */
  readonly accessKeyId: string;
  /** The secret key's last characters ("…k3Xq"). Never the key. */
  readonly secretHint: string | null;
  readonly recurrence: BackupRecurrence;
  /** Days a snapshot stays on S3; the newest one always stays. */
  readonly keep: number;
  /** The class what is sent from now on is stored in ("STANDARD", "GLACIER"…). */
  readonly storageClass: StorageClass;
}

export interface DriveSettings {
  /** The drive that holds the files, or null: the server keeps them. */
  readonly provider: DriveProvider | null;
  /** The drive's address ("https://drive.exemple.fr"); '' when not set. */
  readonly url: string;
  /** The folder in the library that the server manages ("/carnet"). */
  readonly folder: string;
  /** The library's name, as the drive gave it. */
  readonly library: string | null;
  /** The library token's last characters. Never the token. */
  readonly tokenHint: string | null;
  /** Being turned off: the files are coming back to the server first. */
  readonly leaving: boolean;
}

/** Seerr (Jellyseerr, Overseerr): where it answers, and its API key's last characters. */
export interface SeerrSettings {
  /** Its address ("https://seerr.exemple.fr"); '' when not linked. */
  readonly url: string;
  /** Never the key. Null: linked without one (searches only). */
  readonly keyHint: string | null;
}

/** "Demander à Claude" on the pages: off until the Administration turns it on. */
export interface PagesAskSettings {
  /** Questions about the pages may be asked. */
  readonly enabled: boolean;
  /** « Toutes les pages » may be asked: the pages closest to the question are sent. */
  readonly everywhere: boolean;
  /** Claude may search the web too, when the person ticks it. */
  readonly web: boolean;
  /** How much of the pages one question may send. */
  readonly reach: PagesReach;
}

export const PAGES_ASK_DEFAULTS: PagesAskSettings = { enabled: false, everywhere: true, web: true, reach: 'medium' };

/**
 * Agenda's settings on the server: the public holidays it fetches (from Nager.Date, a country and
 * maybe one of its regions, ISO 3166), the secret address its own events are published at
 * (iCalendar, for another calendar to subscribe to), and questions to Claude about the calendar.
 */
export interface CalendarSettings {
  readonly holidays: {
    /** `FR`, `GB`; null: none shown. */
    readonly country: string | null;
    /** `FR-67` (Alsace's own days), `GB-SCT`; null: the country's national days alone. */
    readonly region: string | null;
  };
  /**
   * The path of the published calendar (`/ical/<secret>.ics`, after the server's address), or null
   * when it is not published. Read-only and renewed on demand: unlike a key, it is shown whole, since
   * it is made to be pasted into another calendar.
   */
  readonly publishPath: string | null;
  /** Questions about the calendar may be asked of Claude (off until turned on). */
  readonly ask: boolean;
}

export const CALENDAR_DEFAULTS: CalendarSettings = { holidays: { country: null, region: null }, publishPath: null, ask: false };

/** A country or a region code as Nager.Date writes them. */
export const COUNTRY_PATTERN = /^[A-Z]{2}$/;
export const REGION_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

export interface CalendarPatch {
  /** null: no holidays; the region must be the country's. */
  readonly holidays?: { readonly country: string | null; readonly region?: string | null };
  /** true publishes (keeping the address it had), false unpublishes, `renew` makes a new address (the old one stops working). */
  readonly publish?: boolean | 'renew';
  readonly ask?: boolean;
}

export function parseCalendarSettings(value: unknown): CalendarSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as { holidays?: { country?: unknown; region?: unknown }; publishPath?: unknown; ask?: unknown };
  const country = typeof raw.holidays?.country === 'string' && COUNTRY_PATTERN.test(raw.holidays.country) ? raw.holidays.country : null;
  const region = country && typeof raw.holidays?.region === 'string' && REGION_PATTERN.test(raw.holidays.region) && raw.holidays.region.startsWith(`${country}-`) ? raw.holidays.region : null;
  return {
    holidays: { country, region },
    publishPath: typeof raw.publishPath === 'string' && /^\/ical\/[A-Za-z0-9_-]{16,128}\.ics$/.test(raw.publishPath) ? raw.publishPath : null,
    ask: raw.ask === true,
  };
}

export function parseCalendarPatch(value: unknown): CalendarPatch | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { holidays?: unknown; publish?: unknown; ask?: unknown };
  const out: { holidays?: CalendarPatch['holidays']; publish?: CalendarPatch['publish']; ask?: boolean } = {};
  if (raw.holidays !== undefined) {
    const h = raw.holidays as { country?: unknown; region?: unknown } | null;
    if (typeof h !== 'object' || h === null) return null;
    const country = h.country === null ? null : typeof h.country === 'string' && COUNTRY_PATTERN.test(h.country) ? h.country : undefined;
    if (country === undefined) return null;
    const region = h.region === undefined || h.region === null ? null : typeof h.region === 'string' && REGION_PATTERN.test(h.region) && country !== null && h.region.startsWith(`${country}-`) ? h.region : undefined;
    if (region === undefined) return null;
    out.holidays = { country, region };
  }
  if (raw.publish !== undefined) {
    if (raw.publish !== true && raw.publish !== false && raw.publish !== 'renew') return null;
    out.publish = raw.publish;
  }
  if (raw.ask !== undefined) {
    if (typeof raw.ask !== 'boolean') return null;
    out.ask = raw.ask;
  }
  return out;
}

/** Which apps the server runs. An app turned off keeps its data (it syncs and is backed up); its screens and its work stop. */
export interface AppsSettings {
  /** Ready apps only (`READY_APPS`), at least one, in the suite's order. */
  readonly enabled: readonly AppId[];
}

/** The server's own first run: once done, a device that connects goes straight to its app. */
export interface SetupSettings {
  readonly done: boolean;
}

export interface ServerSettings {
  readonly apps: AppsSettings;
  readonly setup: SetupSettings;
  readonly analysis: {
    /** A key is configured: links are read. */
    readonly enabled: boolean;
    /** Where the key comes from: set in the apps, or the server's environment. */
    readonly keySource: 'app' | 'env' | null;
    /** The key's last characters, for recognising it ("…k3Xq"). Never the key. */
    readonly keyHint: string | null;
    readonly model: ClaudeModel;
    readonly budgetUsd: number;
  };
  readonly pages: PagesAskSettings;
  readonly calendar: CalendarSettings;
  readonly backup: BackupSettings;
  readonly drive: DriveSettings;
  readonly seerr: SeerrSettings;
}

/** Seerr linked or changed: the address (tried before it is kept), and a new API key or '' to drop it. */
export interface SeerrPatch {
  readonly url?: string;
  readonly apiKey?: string;
}

/**
 * Changes to the S3 backup, merged onto what is stored. A change to the connection (endpoint,
 * region, bucket, prefix or keys) is tried on the bucket before anything is kept.
 */
export interface BackupPatch {
  readonly endpoint?: string;
  readonly region?: string;
  readonly bucket?: string;
  readonly prefix?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly recurrence?: BackupRecurrence;
  /** Days. */
  readonly keep?: number;
  /** Tried on the bucket (a small file sent in it) before it is kept. */
  readonly storageClass?: StorageClass;
}

/** Changes to the drive, merged onto what is stored; a new address, token or folder is tried first. */
export interface DrivePatch {
  readonly provider?: DriveProvider;
  readonly url?: string;
  /** A library API token with read and write rights. */
  readonly token?: string;
  readonly folder?: string;
}

export interface SettingsPatch {
  /** The apps the server runs from now on (ready ones, at least one). */
  readonly apps?: readonly AppId[];
  /** The server's first run is over: every device that comes next skips it. */
  readonly setupDone?: true;
  /** A new key, or null to remove the one set from the apps. */
  readonly anthropicApiKey?: string | null;
  readonly model?: ClaudeModel;
  readonly budgetUsd?: number;
  /** Questions about the pages: what changes, merged onto what is kept. */
  readonly pages?: Partial<PagesAskSettings>;
  /** Agenda's: what changes, merged onto what is kept. */
  readonly calendar?: CalendarPatch;
  /** null forgets the S3 settings (what is already on S3 stays there). */
  readonly backup?: BackupPatch | null;
  /** null turns the drive off: its files come back to the server first, and stay in the drive too. */
  readonly drive?: DrivePatch | null;
  /** null unlinks Seerr. */
  readonly seerr?: SeerrPatch | null;
}

export function isClaudeModel(value: unknown): value is ClaudeModel {
  return typeof value === 'string' && (CLAUDE_MODELS as readonly string[]).includes(value);
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const hint = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function parseBackup(value: unknown): BackupSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof BackupSettings, unknown>>;
  const keep = raw.keep;
  return {
    configured: raw.configured === true,
    endpoint: text(raw.endpoint),
    region: text(raw.region),
    bucket: text(raw.bucket),
    prefix: text(raw.prefix),
    accessKeyId: text(raw.accessKeyId),
    secretHint: hint(raw.secretHint),
    recurrence: isBackupRecurrence(raw.recurrence) ? raw.recurrence : 'off',
    keep: typeof keep === 'number' && Number.isInteger(keep) && keep >= 1 ? keep : BACKUP_KEEP_DEFAULT,
    storageClass: isStorageClass(raw.storageClass) ? raw.storageClass : 'STANDARD',
  };
}

function parseDrive(value: unknown): DriveSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof DriveSettings, unknown>>;
  return {
    provider: (DRIVE_PROVIDERS as readonly unknown[]).includes(raw.provider) ? (raw.provider as DriveProvider) : null,
    url: text(raw.url),
    folder: text(raw.folder) || DRIVE_FOLDER_DEFAULT,
    library: hint(raw.library),
    tokenHint: hint(raw.tokenHint),
    leaving: raw.leaving === true,
  };
}

export function parsePagesAsk(value: unknown): PagesAskSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof PagesAskSettings, unknown>>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : PAGES_ASK_DEFAULTS.enabled,
    everywhere: typeof raw.everywhere === 'boolean' ? raw.everywhere : PAGES_ASK_DEFAULTS.everywhere,
    web: typeof raw.web === 'boolean' ? raw.web : PAGES_ASK_DEFAULTS.web,
    reach: isPagesReach(raw.reach) ? raw.reach : PAGES_ASK_DEFAULTS.reach,
  };
}

function parseSeerr(value: unknown): SeerrSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof SeerrSettings, unknown>>;
  return { url: text(raw.url), keyHint: hint(raw.keyHint) };
}

/** A list of apps as a server holds it: ready ones, once each, in the suite's order; null when none is left. */
export function parseEnabledApps(value: unknown): AppId[] | null {
  if (!Array.isArray(value)) return null;
  const enabled = READY_APPS.filter(id => value.includes(id) && isReadyApp(id));
  return enabled.length > 0 ? enabled : null;
}

export function parseServerSettings(body: unknown): ServerSettings | null {
  const raw = body as { apps?: { enabled?: unknown }; setup?: { done?: unknown }; analysis?: Partial<ServerSettings['analysis']>; pages?: unknown; calendar?: unknown; backup?: unknown; drive?: unknown; seerr?: unknown } | null;
  const analysis = raw?.analysis;
  if (!analysis || typeof analysis.enabled !== 'boolean') return null;
  return {
    // An older server runs Carnet alone, and was set up.
    apps: { enabled: parseEnabledApps(raw.apps?.enabled) ?? ['notes'] },
    setup: { done: raw.setup?.done !== false },
    analysis: {
      enabled: analysis.enabled,
      keySource: analysis.keySource === 'app' || analysis.keySource === 'env' ? analysis.keySource : null,
      keyHint: typeof analysis.keyHint === 'string' ? analysis.keyHint : null,
      model: isClaudeModel(analysis.model) ? analysis.model : 'claude-opus-5-5',
      budgetUsd: typeof analysis.budgetUsd === 'number' ? analysis.budgetUsd : 0,
    },
    pages: parsePagesAsk(raw.pages),
    calendar: parseCalendarSettings(raw.calendar),
    backup: parseBackup(raw.backup),
    drive: parseDrive(raw.drive),
    seerr: parseSeerr(raw.seerr),
  };
}

/**
 * The optional services the Administration sets up: Claude (a key), the backup to S3, the drive
 * (Seafile) and Seerr. What leans on one shows in the apps only once the server has said it is set
 * up (each client remembers what it last said: the web's `useServerFeature`, the phone's).
 */
export const SERVER_FEATURES = ['claude', 'backup', 'drive', 'seerr'] as const;
export type ServerFeature = (typeof SERVER_FEATURES)[number];

/** Which of them a server has set up, as far as it has said: a feature left out is not known yet. */
export type ServerFeatures = { readonly [F in ServerFeature]?: boolean };

/** What the server's settings say of each: Claude has a key, S3 is set, a drive holds the files, Seerr is linked. */
export function serverFeatures(settings: ServerSettings): Required<ServerFeatures> {
  return {
    claude: settings.analysis.enabled,
    backup: settings.backup.configured,
    drive: settings.drive.provider !== null,
    seerr: settings.seerr.url !== '',
  };
}

/** Features as a device kept them: known ones only, each true or false. */
export function parseServerFeatures(value: unknown): ServerFeatures {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const known: { [F in ServerFeature]?: boolean } = {};
  for (const feature of SERVER_FEATURES) if (typeof raw[feature] === 'boolean') known[feature] = raw[feature];
  return known;
}
