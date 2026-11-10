/**
 * Settings set from the apps' Administration, one row per key: the apps the server runs and
 * whether its first run is over, link reading
 * (the Claude key, the model, the monthly budget, with the environment as a
 * fallback: an app value wins, then the environment, then the default), the
 * questions about the pages, the S3 backup, the drive that holds the files and Seerr. They are read on every use,
 * so a change applies without a restart. Secrets are stored as they are and
 * only their last characters leave the server.
 */
import { randomBytes } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import { READY_APPS, type AppId } from '@unlease/core/apps';
import {
  BACKUP_KEEP_DEFAULT,
  COUNTRY_PATTERN,
  REGION_PATTERN,
  DRIVE_FOLDER_DEFAULT,
  isBackupRecurrence,
  isClaudeModel,
  isPagesReach,
  isStorageClass,
  PAGES_ASK_DEFAULTS,
  parseEnabledApps,
  type BackupRecurrence,
  type CalendarSettings,
  type ClaudeModel,
  type DriveProvider,
  type PagesAskSettings,
  type ServerSettings,
  type StorageClass,
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
  /** Days a snapshot stays on S3 (the newest one always does). */
  readonly keep: number;
  /** The class files and snapshots are sent in from now on. */
  readonly storageClass: StorageClass;
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

const APPS_KEY = 'apps.enabled';
const SETUP_KEY = 'setup.done';
const KEY = 'anthropicApiKey';
const MODEL = 'model';
const BUDGET = 'budgetUsd';
const BACKUP_KEYS = ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId', 'secretAccessKey', 'recurrence', 'keep', 'storageClass'] as const;
const DRIVE_KEYS = ['provider', 'url', 'token', 'folder', 'repoId', 'library', 'leaving'] as const;
const SEERR_KEYS = ['url', 'apiKey'] as const;

const CALENDAR_COUNTRY = 'calendar.country';
const CALENDAR_REGION = 'calendar.region';
const CALENDAR_PUBLISH = 'calendar.publish';
const CALENDAR_ASK = 'calendar.ask';

/** Agenda's public holidays: a country, and maybe one of its regions. */
export interface HolidaysConfig {
  readonly country: string | null;
  readonly region: string | null;
}

/** What changes of Agenda's settings, checked by `applySettingsPatch`. */
export interface CalendarChanges {
  readonly holidays?: HolidaysConfig;
  readonly publish?: boolean | 'renew';
  readonly ask?: boolean;
}

const hintOf = (secret: string): string => `…${secret.slice(-4)}`;
const storageClassOf = (value: unknown): StorageClass => (isStorageClass(value) ? value : 'STANDARD');

export class SettingsStore {
  private readonly all: StatementSync;
  private readonly put: StatementSync;
  private readonly remove: StatementSync;
  private readonly driveFiles: StatementSync;
  private readonly appsListeners = new Set<(enabled: readonly AppId[]) => void>();
  private readonly holidaysListeners = new Set<(holidays: HolidaysConfig) => void>();

  constructor(
    private readonly db: Database,
    private readonly fallbacks: SettingsFallbacks,
  ) {
    this.all = db.prepare('SELECT key, value FROM settings');
    this.put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
    this.remove = db.prepare('DELETE FROM settings WHERE key = ?');
    this.driveFiles = db.prepare('SELECT COUNT(*) AS count FROM drive_files');
  }

  /** The apps the server runs: every ready one until the Administration (or the first run) chose. */
  enabledApps(): AppId[] {
    const stored = this.stored().get(APPS_KEY);
    let parsed: unknown = null;
    try {
      parsed = typeof stored === 'string' ? JSON.parse(stored) : null;
    } catch {
      parsed = null;
    }
    return parseEnabledApps(parsed) ?? [...READY_APPS];
  }

  /** Ready apps only, at least one (`parseEnabledApps`): checked by `applySettingsPatch`. Tells the listeners when the list changes. */
  updateApps(enabled: readonly AppId[]): void {
    const next = parseEnabledApps(enabled);
    if (!next) return;
    const before = this.enabledApps();
    this.put.run(APPS_KEY, JSON.stringify(next));
    if (before.join() !== next.join()) for (const listener of this.appsListeners) listener(next);
  }

  /** Hears every change of the apps the server runs (their background work starts and stops). */
  onApps(listener: (enabled: readonly AppId[]) => void): () => void {
    this.appsListeners.add(listener);
    return () => this.appsListeners.delete(listener);
  }

  /** The server's own first run is over: the next device skips it. False until it is said so. */
  setupDone(): boolean {
    return this.stored().get(SETUP_KEY) === 1;
  }

  /** Once over, for good: nothing sets it back (a restore leaves settings alone). */
  markSetupDone(): void {
    this.put.run(SETUP_KEY, 1);
  }

  /**
   * At start, once: a server that never stored the flag (one from before it existed) is set up when
   * it already holds data, and a new one is not. Stored either way, so data that comes later (a
   * device syncing before the first run ends) never passes for an old server.
   */
  settleSetup(holdsData: boolean): void {
    if (this.stored().has(SETUP_KEY)) return;
    this.put.run(SETUP_KEY, holdsData ? 1 : 0);
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
      storageClass: storageClassOf(stored.get('backup.storageClass')),
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

  /** Agenda's public holidays: none until the setup or the Administration picks a country. */
  holidays(): HolidaysConfig {
    const stored = this.stored();
    const country = stored.get(CALENDAR_COUNTRY);
    const region = stored.get(CALENDAR_REGION);
    const code = typeof country === 'string' && COUNTRY_PATTERN.test(country) ? country : null;
    return { country: code, region: code && typeof region === 'string' && REGION_PATTERN.test(region) && region.startsWith(`${code}-`) ? region : null };
  }

  /** The published calendar's secret, or null while it is not published. */
  publishSecret(): string | null {
    const value = this.stored().get(CALENDAR_PUBLISH);
    return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
  }

  calendar(): CalendarSettings {
    const secret = this.publishSecret();
    return { holidays: this.holidays(), publishPath: secret ? `/ical/${secret}.ics` : null, ask: this.stored().get(CALENDAR_ASK) === 1 };
  }

  /** Hears every change of the holidays' country or region (the server fetches them again). */
  onHolidays(listener: (holidays: HolidaysConfig) => void): () => void {
    this.holidaysListeners.add(listener);
    return () => this.holidaysListeners.delete(listener);
  }

  updateCalendar(changes: CalendarChanges): void {
    const before = this.holidays();
    transaction(this.db, () => {
      if (changes.holidays) {
        if (changes.holidays.country) this.put.run(CALENDAR_COUNTRY, changes.holidays.country);
        else this.remove.run(CALENDAR_COUNTRY);
        if (changes.holidays.country && changes.holidays.region) this.put.run(CALENDAR_REGION, changes.holidays.region);
        else this.remove.run(CALENDAR_REGION);
      }
      if (changes.publish === false) this.remove.run(CALENDAR_PUBLISH);
      // Published again, it keeps the address it had; renewed, the old one stops answering.
      else if (changes.publish === 'renew' || (changes.publish === true && !this.publishSecret())) this.put.run(CALENDAR_PUBLISH, randomBytes(24).toString('base64url'));
      if (changes.ask !== undefined) this.put.run(CALENDAR_ASK, changes.ask ? 1 : 0);
    });
    const after = this.holidays();
    if (before.country !== after.country || before.region !== after.region) for (const listener of this.holidaysListeners) listener(after);
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
      apps: { enabled: this.enabledApps() },
      setup: { done: this.setupDone() },
      analysis: { enabled: apiKey !== null, keySource, keyHint: apiKey ? hintOf(apiKey) : null, model, budgetUsd },
      pages: this.pages(),
      calendar: this.calendar(),
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
        storageClass: storageClassOf(stored.get('backup.storageClass')),
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
