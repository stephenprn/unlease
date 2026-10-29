/**
 * Server settings set from the apps' Administration: link reading by Claude and questions about
 * the pages, the backup to S3, the drive that holds the files (Seafile) and Seerr for the films and series modules. Keys and secrets are set from the apps, never from
 * source, and never come back: only their last characters do.
 * `GET /api/settings` -> ServerSettings; `PUT` a SettingsPatch -> the same, or 400/502 { error }.
 */

import { SUITE_NAME } from '../apps';
import { localized, tx } from '../i18n';

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

/** Snapshots kept on S3, the newest ones. */
export const BACKUP_KEEP_DEFAULT = 30;
export const BACKUP_KEEP_MAX = 365;

export function isBackupRecurrence(value: unknown): value is BackupRecurrence {
  return typeof value === 'string' && (BACKUP_RECURRENCES as readonly string[]).includes(value);
}

/** The drives that can hold the files. */
export const DRIVE_PROVIDERS = ['seafile'] as const;
export type DriveProvider = (typeof DRIVE_PROVIDERS)[number];

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
  readonly keep: number;
}

export interface DriveSettings {
  /** The drive that holds the files, or null: the server keeps them. */
  readonly provider: DriveProvider | null;
  /** The drive's address ("https://drive.exemple.fr"); '' when not set. */
  readonly url: string;
  /** The folder in the library that the server manages ("/Carnet"). */
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

export interface ServerSettings {
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
  readonly keep?: number;
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
  /** A new key, or null to remove the one set from the apps. */
  readonly anthropicApiKey?: string | null;
  readonly model?: ClaudeModel;
  readonly budgetUsd?: number;
  /** Questions about the pages: what changes, merged onto what is kept. */
  readonly pages?: Partial<PagesAskSettings>;
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

export function parseServerSettings(body: unknown): ServerSettings | null {
  const raw = body as { analysis?: Partial<ServerSettings['analysis']>; pages?: unknown; backup?: unknown; drive?: unknown; seerr?: unknown } | null;
  const analysis = raw?.analysis;
  if (!analysis || typeof analysis.enabled !== 'boolean') return null;
  return {
    analysis: {
      enabled: analysis.enabled,
      keySource: analysis.keySource === 'app' || analysis.keySource === 'env' ? analysis.keySource : null,
      keyHint: typeof analysis.keyHint === 'string' ? analysis.keyHint : null,
      model: isClaudeModel(analysis.model) ? analysis.model : 'claude-opus-5-5',
      budgetUsd: typeof analysis.budgetUsd === 'number' ? analysis.budgetUsd : 0,
    },
    pages: parsePagesAsk(raw.pages),
    backup: parseBackup(raw.backup),
    drive: parseDrive(raw.drive),
    seerr: parseSeerr(raw.seerr),
  };
}
