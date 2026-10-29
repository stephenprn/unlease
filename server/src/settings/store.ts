/**
 * Settings set from the apps' Administration, one row per key: link reading
 * (the Claude key, the model, the monthly budget, with the environment as a
 * fallback: an app value wins, then the environment, then the default), the
 * questions about the pages, the S3 backup, the drive that holds the files and Seerr. They are read on every use,
 * so a change applies without a restart. Secrets are stored as they are and
 * only their last characters leave the server.
 */
import type { StatementSync } from 'node:sqlite';
import {
  BACKUP_KEEP_DEFAULT,
  DRIVE_FOLDER_DEFAULT,
  isBackupRecurrence,
  isClaudeModel,
  isPagesReach,
  PAGES_ASK_DEFAULTS,
  type BackupRecurrence,
  type ClaudeModel,
  type DriveProvider,
  type PagesAskSettings,
  type ServerSettings,
} from '@unlease/core/sync/settings';
import { transaction, type Database } from '../db/database';

/** What the environment provides, defaults already applied to the model and budget. */
export interface SettingsFallbacks {
  readonly apiKey: string | null;
  readonly model: ClaudeModel;
  readonly budgetUsd: number;
}

export interface EffectiveSettings {
  readonly apiKey: string | null;
  readonly keySource: 'app' | 'env' | null;
  readonly model: ClaudeModel;
  readonly budgetUsd: number;
}

export interface SettingsChanges {
  /** A new app key, or null to remove it (the environment's key, if any, applies again). */
  apiKey?: string | null;
  model?: ClaudeModel;
  budgetUsd?: number;
}

/** Where backups go; complete or absent. */
export interface BackupConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly recurrence: BackupRecurrence;
  readonly keep: number;
}

/** Seerr, for the films and series modules: its address, and its API key when one was given. */
export interface SeerrConfig {
  readonly url: string;
  readonly apiKey: string;
}

/** The drive that holds the files; complete or absent. */
export interface DriveConfig {
  readonly provider: DriveProvider;
  readonly url: string;
  readonly token: string;
  readonly folder: string;
  /** The library the token opens, as found when it was checked. */
  readonly repoId: string;
  readonly library: string;
  /** Being turned off: its files come back first. */
  readonly leaving: boolean;
}

const KEY = 'anthropicApiKey';
const MODEL = 'model';
const BUDGET = 'budgetUsd';
const BACKUP_KEYS = ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId', 'secretAccessKey', 'recurrence', 'keep'] as const;
const DRIVE_KEYS = ['provider', 'url', 'token', 'folder', 'repoId', 'library', 'leaving'] as const;
const SEERR_KEYS = ['url', 'apiKey'] as const;

const hintOf = (secret: string): string => `…${secret.slice(-4)}`;

export class SettingsStore {
  private readonly all: StatementSync;
  private readonly put: StatementSync;
  private readonly remove: StatementSync;
  private readonly driveFiles: StatementSync;

  constructor(
    private readonly db: Database,
    private readonly fallbacks: SettingsFallbacks,
  ) {
    this.all = db.prepare('SELECT key, value FROM settings');
    this.put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
    this.remove = db.prepare('DELETE FROM settings WHERE key = ?');
    this.driveFiles = db.prepare('SELECT COUNT(*) AS count FROM drive_files');
  }

  /** Files the drive holds for the server, or still has to delete. */
  driveFileCount(): number {
    return Number((this.driveFiles.get() as { count: number }).count);
  }

  private stored(): Map<string, unknown> {
    return new Map((this.all.all() as unknown as { key: string; value: unknown }[]).map(row => [row.key, row.value]));
  }

  effective(): EffectiveSettings {
    const stored = this.stored();
    const appKey = stored.get(KEY);
    const model = stored.get(MODEL);
    const budget = stored.get(BUDGET);
    const fromApp = typeof appKey === 'string' && appKey.length > 0 ? appKey : null;
    return {
      apiKey: fromApp ?? this.fallbacks.apiKey,
      keySource: fromApp ? 'app' : this.fallbacks.apiKey ? 'env' : null,
      model: isClaudeModel(model) ? model : this.fallbacks.model,
      budgetUsd: typeof budget === 'number' && Number.isFinite(budget) && budget >= 0 ? budget : this.fallbacks.budgetUsd,
    };
  }

  /** The S3 settings, or null until an endpoint, a bucket and both keys are set. */
  backup(): BackupConfig | null {
    const stored = this.stored();
    const text = (name: string): string => {
      const value = stored.get(`backup.${name}`);
      return typeof value === 'string' ? value : '';
    };
    const recurrence = text('recurrence');
    const keep = stored.get('backup.keep');
    const config: BackupConfig = {
      endpoint: text('endpoint'),
      region: text('region'),
      bucket: text('bucket'),
      prefix: text('prefix'),
      accessKeyId: text('accessKeyId'),
      secretAccessKey: text('secretAccessKey'),
      recurrence: isBackupRecurrence(recurrence) ? recurrence : 'off',
      keep: typeof keep === 'number' && Number.isInteger(keep) && keep >= 1 ? keep : BACKUP_KEEP_DEFAULT,
    };
    return config.endpoint && config.region && config.bucket && config.accessKeyId && config.secretAccessKey ? config : null;
  }

  /** The drive, or null when the server keeps its files itself. */
  drive(): DriveConfig | null {
    const stored = this.stored();
    const text = (name: string): string => {
      const value = stored.get(`drive.${name}`);
      return typeof value === 'string' ? value : '';
    };
    if (text('provider') !== 'seafile' || !text('url') || !text('token') || !text('repoId')) return null;
    return {
      provider: 'seafile',
      url: text('url'),
      token: text('token'),
      folder: text('folder') || DRIVE_FOLDER_DEFAULT,
      repoId: text('repoId'),
      library: text('library'),
      leaving: stored.get('drive.leaving') === 1,
    };
  }

  /** Questions about the pages: off until the Administration turns them on. */
  pages(): PagesAskSettings {
    const stored = this.stored();
    const flag = (name: 'enabled' | 'everywhere' | 'web'): boolean => {
      const value = stored.get(`pages.${name}`);
      return value === 1 ? true : value === 0 ? false : PAGES_ASK_DEFAULTS[name];
    };
    const reach = stored.get('pages.reach');
    return { enabled: flag('enabled'), everywhere: flag('everywhere'), web: flag('web'), reach: isPagesReach(reach) ? reach : PAGES_ASK_DEFAULTS.reach };
  }

  updatePages(changes: Partial<PagesAskSettings>): void {
    transaction(this.db, () => {
      for (const name of ['enabled', 'everywhere', 'web'] as const) {
        const value = changes[name];
        if (value !== undefined) this.put.run(`pages.${name}`, value ? 1 : 0);
      }
      if (changes.reach !== undefined) this.put.run('pages.reach', changes.reach);
    });
  }

  /** Seerr, or null when it is not linked. */
  seerr(): SeerrConfig | null {
    const stored = this.stored();
    const url = stored.get('seerr.url');
    const apiKey = stored.get('seerr.apiKey');
    return typeof url === 'string' && url ? { url, apiKey: typeof apiKey === 'string' ? apiKey : '' } : null;
  }

  /** What the apps see: never a key, a secret or a token, only their last four characters. */
  view(): ServerSettings {
    const { apiKey, keySource, model, budgetUsd } = this.effective();
    const stored = this.stored();
    const text = (key: string): string => {
      const value = stored.get(key);
      return typeof value === 'string' ? value : '';
    };
    const backup = this.backup();
    const drive = this.drive();
    const seerr = this.seerr();
    const recurrence = text('backup.recurrence');
    const keep = stored.get('backup.keep');
    return {
      analysis: { enabled: apiKey !== null, keySource, keyHint: apiKey ? hintOf(apiKey) : null, model, budgetUsd },
      pages: this.pages(),
      backup: {
        configured: backup !== null,
        endpoint: text('backup.endpoint'),
        region: text('backup.region'),
        bucket: text('backup.bucket'),
        prefix: text('backup.prefix'),
        accessKeyId: text('backup.accessKeyId'),
        secretHint: text('backup.secretAccessKey') ? hintOf(text('backup.secretAccessKey')) : null,
        recurrence: isBackupRecurrence(recurrence) ? recurrence : 'off',
        keep: typeof keep === 'number' && Number.isInteger(keep) && keep >= 1 ? keep : BACKUP_KEEP_DEFAULT,
      },
      drive: {
        provider: drive ? drive.provider : null,
        url: drive?.url ?? '',
        folder: drive?.folder ?? DRIVE_FOLDER_DEFAULT,
        library: drive?.library || null,
        tokenHint: drive ? hintOf(drive.token) : null,
        leaving: drive?.leaving ?? false,
      },
      seerr: { url: seerr?.url ?? '', keyHint: seerr?.apiKey ? hintOf(seerr.apiKey) : null },
    };
  }

  update(changes: SettingsChanges): void {
    transaction(this.db, () => {
      if (changes.apiKey === null) this.remove.run(KEY);
      else if (changes.apiKey !== undefined) this.put.run(KEY, changes.apiKey);
      if (changes.model !== undefined) this.put.run(MODEL, changes.model);
      if (changes.budgetUsd !== undefined) this.put.run(BUDGET, changes.budgetUsd);
    });
  }

  /** Merges `changes` onto the S3 settings; null forgets them. Moving to another place forgets which files are already there. */
  updateBackup(changes: Partial<BackupConfig> | null): void {
    transaction(this.db, () => {
      if (changes === null) {
        for (const name of BACKUP_KEYS) this.remove.run(`backup.${name}`);
        this.db.exec('DELETE FROM backup_files');
        return;
      }
      const before = this.backup();
      for (const name of BACKUP_KEYS) {
        const value = changes[name];
        if (value !== undefined) this.put.run(`backup.${name}`, value);
      }
      const after = this.backup();
      if (before && (!after || before.endpoint !== after.endpoint || before.bucket !== after.bucket || before.prefix !== after.prefix)) this.db.exec('DELETE FROM backup_files');
    });
  }

  /** Merges `changes` onto Seerr's settings; null unlinks it. */
  updateSeerr(changes: Partial<SeerrConfig> | null): void {
    transaction(this.db, () => {
      for (const name of SEERR_KEYS) {
        const value = changes === null ? '' : changes[name];
        if (value === undefined) continue;
        if (value) this.put.run(`seerr.${name}`, value);
        else this.remove.run(`seerr.${name}`);
      }
    });
  }

  /** Merges `changes` onto the drive's settings; null forgets them (once its files are back). */
  updateDrive(changes: Partial<DriveConfig> | null): void {
    transaction(this.db, () => {
      if (changes === null) {
        for (const name of DRIVE_KEYS) this.remove.run(`drive.${name}`);
        return;
      }
      for (const name of DRIVE_KEYS) {
        const value = changes[name];
        if (value === undefined) continue;
        this.put.run(`drive.${name}`, typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    });
  }
}
