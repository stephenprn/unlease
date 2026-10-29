/**
 * `PUT /api/settings`. Every field is checked first; then what connects to
 * something is tried with it: a new Claude key against Anthropic (a free call,
 * listing models), new S3 settings on the bucket (listed, a small file written
 * and deleted), a new drive on its library (with read and write rights, its
 * folder made if missing), Seerr at its address (and its key, when one comes).
 * Only when all of it holds is anything stored. Keys, secrets and tokens never
 * reach a log.
 */
import { SUITE_SLUG } from '@unlease/core/apps';
import Anthropic from '@anthropic-ai/sdk';
import { BACKUP_KEEP_MAX, DRIVE_FOLDER_DEFAULT, isBackupRecurrence, isClaudeModel, isPagesReach, type PagesAskSettings } from '@unlease/core/sync/settings';
import { s3Problem, S3Client, S3Error } from '../backup/s3';
import { SeafileClient, SeafileError, seafileProblem } from '../drive/seafile';
import { SeerrClient, SeerrError, seerrProblem } from '../apps/notes/seerr';
import type { BackupConfig, DriveConfig, SeerrConfig, SettingsChanges, SettingsStore } from './store';

/** One free request authenticated with `apiKey`; tests stand in for it. */
export type ListModels = (apiKey: string) => Promise<unknown>;

export const anthropicListModels: ListModels = apiKey =>
  // An explicit null keeps a stray ANTHROPIC_AUTH_TOKEN in the environment out of the check.
  new Anthropic({ apiKey, authToken: null, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });

export type KeyCheck = 'valid' | 'refused' | 'unreachable';

export async function checkKey(apiKey: string, listModels: ListModels): Promise<KeyCheck> {
  try {
    await listModels(apiKey);
    return 'valid';
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return 'refused';
    return 'unreachable';
  }
}

export type SettingsOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 400 | 502; readonly error: string };

type Refusal = Extract<SettingsOutcome, { ok: false }>;

/** Tries a bucket with its keys: null when it answers. */
export type CheckS3 = (config: BackupConfig) => Promise<Refusal | null>;

/** Tries a drive: the library its token opens, once its folder is there. */
export type CheckDrive = (drive: Pick<DriveConfig, 'url' | 'token' | 'folder'>) => Promise<{ readonly ok: true; readonly repoId: string; readonly library: string } | Refusal>;

/** Tries Seerr: null when its address answers as Seerr and its key, if any, opens it. */
export type CheckSeerr = (config: SeerrConfig) => Promise<Refusal | null>;

export interface SettingsChecks {
  readonly listModels: ListModels;
  readonly checkS3: CheckS3;
  readonly checkDrive: CheckDrive;
  readonly checkSeerr: CheckSeerr;
}

/** What the check writes and deletes under the prefix: backups need to list, write and delete. */
export const S3_PROBE = `.${SUITE_SLUG}-essai`;

export const checkS3Bucket = async (config: BackupConfig, fetcher: typeof fetch = fetch): Promise<Refusal | null> => {
  // Answered at once: the person is waiting, and can try again.
  const client = new S3Client(config, fetcher, undefined, []);
  try {
    await client.list(config.prefix, 1);
    await client.put(`${config.prefix}${S3_PROBE}`, Buffer.from('essai'), 'text/plain');
    await client.delete(`${config.prefix}${S3_PROBE}`);
    return null;
  } catch (error) {
    return refuse(error instanceof S3Error && error.status > 0 ? 400 : 502, s3Problem(error));
  }
};

export const checkSeafile = async (drive: Pick<DriveConfig, 'url' | 'token' | 'folder'>, fetcher: typeof fetch = fetch): ReturnType<CheckDrive> => {
  const client = new SeafileClient(drive.url, drive.token, fetcher);
  try {
    const repo = await client.repoInfo();
    if (!(await client.canWrite())) return refuse(400, 'Ce jeton est en lecture seule : il faut la lecture et l’écriture');
    await client.ensureDir(drive.folder);
    return { ok: true, repoId: repo.id, library: repo.name };
  } catch (error) {
    if (error instanceof SeafileError && error.status === 404) return refuse(400, 'Cette adresse ne répond pas comme un serveur Seafile');
    return refuse(error instanceof SeafileError && error.status > 0 ? 400 : 502, seafileProblem(error));
  }
};

export const checkSeerrServer = async (config: SeerrConfig, fetcher: typeof fetch = fetch): Promise<Refusal | null> => {
  const client = new SeerrClient(config.url, config.apiKey, fetcher);
  try {
    await client.status();
    if (config.apiKey) await client.me();
    return null;
  } catch (error) {
    return refuse(error instanceof SeerrError && error.status !== 0 ? 400 : 502, seerrProblem(error));
  }
};

export const defaultChecks: SettingsChecks = {
  listModels: anthropicListModels,
  checkS3: config => checkS3Bucket(config),
  checkDrive: drive => checkSeafile(drive),
  checkSeerr: config => checkSeerrServer(config),
};

const BUDGET_MAX_USD = 10_000;
/** Printable ASCII without spaces: anything else would not even make a valid header. */
const KEY_SHAPE = /^[!-~]{8,300}$/;
const ACCESS_KEY_SHAPE = /^[!-~]{3,128}$/;
const SECRET_SHAPE = /^[!-~]{8,256}$/;
const BUCKET_SHAPE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_SHAPE = /^[a-z0-9-]{2,40}$/;
const PREFIX_SHAPE = /^[A-Za-z0-9!_.*'()/-]{0,200}$/;

const refuse = (status: 400 | 502, error: string): Refusal => ({ ok: false, status, error });

/** An http(s) address without query or fragment, its trailing slash dropped; null when it is not one. */
function address(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash || url.username) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** "unlease/" from " /unlease ", "" from "": no empty, `.` or `..` segment. */
function prefixOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!PREFIX_SHAPE.test(trimmed) || trimmed.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) return null;
  return `${trimmed}/`;
}

/** "/Unlease/Fichiers" from "Unlease/Fichiers/": never the library's root. */
function folderOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const segments = value.trim().split('/').filter(Boolean);
  if (segments.length === 0 || segments.some(segment => segment === '.' || segment === '..' || /[\u0000-\u001f\\]/.test(segment) || segment.length > 120)) return null;
  return `/${segments.join('/')}`;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function applySettingsPatch(store: SettingsStore, body: unknown, checks: SettingsChecks): Promise<SettingsOutcome> {
  if (!isObject(body)) return refuse(400, 'Requête invalide');
  const patch = body;
  const changes: SettingsChanges = {};

  if (patch.model !== undefined) {
    if (!isClaudeModel(patch.model)) return refuse(400, 'Modèle inconnu');
    changes.model = patch.model;
  }
  if (patch.budgetUsd !== undefined) {
    const budget = patch.budgetUsd;
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || budget > BUDGET_MAX_USD) {
      return refuse(400, 'Budget invalide');
    }
    changes.budgetUsd = budget;
  }
  // Questions about the pages: switches and a reach, nothing to try.
  let pages: Partial<PagesAskSettings> | undefined;
  if (patch.pages !== undefined) {
    if (!isObject(patch.pages)) return refuse(400, 'Requête invalide');
    const raw = patch.pages;
    const next: { -readonly [K in keyof PagesAskSettings]?: PagesAskSettings[K] } = {};
    for (const name of ['enabled', 'everywhere', 'web'] as const) {
      if (raw[name] === undefined) continue;
      if (typeof raw[name] !== 'boolean') return refuse(400, 'Requête invalide');
      next[name] = raw[name];
    }
    if (raw.reach !== undefined) {
      if (!isPagesReach(raw.reach)) return refuse(400, 'Requête invalide');
      next.reach = raw.reach;
    }
    pages = next;
  }
  let newKey: string | null = null;
  if (patch.anthropicApiKey === null) {
    changes.apiKey = null;
  } else if (patch.anthropicApiKey !== undefined) {
    const key = typeof patch.anthropicApiKey === 'string' ? patch.anthropicApiKey.trim() : '';
    if (!KEY_SHAPE.test(key)) return refuse(400, 'Clé invalide');
    newKey = key;
  }

  // The S3 backup: checked field by field, then the whole is tried when its connection changes.
  let backup: Partial<BackupConfig> | null | undefined;
  let backupToTry: BackupConfig | null = null;
  if (patch.backup === null) {
    backup = null;
  } else if (patch.backup !== undefined) {
    if (!isObject(patch.backup)) return refuse(400, 'Requête invalide');
    const raw = patch.backup;
    const next: { -readonly [K in keyof BackupConfig]?: BackupConfig[K] } = {};
    if (raw.endpoint !== undefined) {
      const endpoint = address(raw.endpoint);
      if (!endpoint) return refuse(400, 'Adresse du service S3 invalide');
      next.endpoint = endpoint;
    }
    if (raw.region !== undefined) {
      const region = typeof raw.region === 'string' ? raw.region.trim().toLowerCase() : '';
      if (!REGION_SHAPE.test(region)) return refuse(400, 'Région invalide');
      next.region = region;
    }
    if (raw.bucket !== undefined) {
      const bucket = typeof raw.bucket === 'string' ? raw.bucket.trim() : '';
      if (!BUCKET_SHAPE.test(bucket)) return refuse(400, 'Nom de bucket invalide');
      next.bucket = bucket;
    }
    if (raw.prefix !== undefined) {
      const prefix = prefixOf(raw.prefix);
      if (prefix === null) return refuse(400, 'Dossier dans le bucket invalide');
      next.prefix = prefix;
    }
    if (raw.accessKeyId !== undefined) {
      const id = typeof raw.accessKeyId === 'string' ? raw.accessKeyId.trim() : '';
      if (!ACCESS_KEY_SHAPE.test(id)) return refuse(400, 'Clé d’accès invalide');
      next.accessKeyId = id;
    }
    if (raw.secretAccessKey !== undefined) {
      const secret = typeof raw.secretAccessKey === 'string' ? raw.secretAccessKey.trim() : '';
      if (!SECRET_SHAPE.test(secret)) return refuse(400, 'Clé secrète invalide');
      next.secretAccessKey = secret;
    }
    if (raw.recurrence !== undefined) {
      if (!isBackupRecurrence(raw.recurrence)) return refuse(400, 'Fréquence inconnue');
      next.recurrence = raw.recurrence;
    }
    if (raw.keep !== undefined) {
      if (!Number.isInteger(raw.keep) || (raw.keep as number) < 1 || (raw.keep as number) > BACKUP_KEEP_MAX) return refuse(400, 'Nombre de sauvegardes invalide');
      next.keep = raw.keep as number;
    }
    const stored = store.backup();
    const connection = (['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId', 'secretAccessKey'] as const).some(name => next[name] !== undefined);
    if (connection) {
      const merged: BackupConfig = { endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '', recurrence: 'off', keep: 30, ...stored, ...next };
      if (!merged.secretAccessKey) return refuse(400, 'Clé secrète manquante');
      if (!merged.endpoint || !merged.region || !merged.bucket || !merged.accessKeyId) return refuse(400, 'Renseignez l’adresse du service, la région, le bucket et la clé d’accès');
      backupToTry = merged;
      // Set for the first time: backed up every day unless told otherwise.
      if (!stored && next.recurrence === undefined) next.recurrence = 'daily';
    } else if (!stored && Object.keys(next).length > 0) {
      return refuse(400, 'Renseignez d’abord le stockage S3');
    }
    backup = next;
  }

  // The drive: the same, its library and rights tried when its address, token or folder change.
  let drive: Partial<DriveConfig> | null | undefined;
  let driveToTry: Pick<DriveConfig, 'url' | 'token' | 'folder'> | null = null;
  if (patch.drive === null) {
    drive = null;
  } else if (patch.drive !== undefined) {
    if (!isObject(patch.drive)) return refuse(400, 'Requête invalide');
    const raw = patch.drive;
    if (raw.provider !== undefined && raw.provider !== 'seafile') return refuse(400, 'Drive inconnu');
    const stored = store.drive();
    let url = stored?.url ?? '';
    let token = stored?.token ?? '';
    let folder = stored?.folder ?? DRIVE_FOLDER_DEFAULT;
    if (raw.url !== undefined) {
      const next = address(raw.url);
      if (!next) return refuse(400, 'Adresse Seafile invalide');
      url = next;
    }
    if (raw.token !== undefined) {
      const next = typeof raw.token === 'string' ? raw.token.trim() : '';
      if (!SECRET_SHAPE.test(next)) return refuse(400, 'Jeton invalide');
      token = next;
    }
    if (raw.folder !== undefined) {
      const next = folderOf(raw.folder);
      if (!next) return refuse(400, 'Choisissez un dossier de la bibliothèque (pas sa racine)');
      folder = next;
    }
    if (!url || !token) return refuse(400, 'Renseignez l’adresse de Seafile et le jeton de la bibliothèque');
    if (!stored || stored.leaving || url !== stored.url || token !== stored.token || folder !== stored.folder) {
      driveToTry = { url, token, folder };
      drive = { provider: 'seafile', url, token, folder, leaving: false };
    }
  }

  // Seerr: its address tried, and its key when one comes ('' drops it: searches only, nothing to try).
  let seerr: SeerrConfig | null | undefined;
  let seerrToTry = false;
  if (patch.seerr === null) {
    seerr = null;
  } else if (patch.seerr !== undefined) {
    if (!isObject(patch.seerr)) return refuse(400, 'Requête invalide');
    const raw = patch.seerr;
    const stored = store.seerr();
    let url = stored?.url ?? '';
    let apiKey = stored?.apiKey ?? '';
    if (raw.url !== undefined) {
      const next = address(raw.url);
      if (!next) return refuse(400, 'Adresse Seerr invalide');
      url = next;
    }
    if (raw.apiKey !== undefined) {
      const next = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : null;
      if (next === null || (next !== '' && !KEY_SHAPE.test(next))) return refuse(400, 'Clé API invalide');
      apiKey = next;
    }
    if (!url) return refuse(400, 'Renseignez l’adresse de Seerr');
    if (!stored || url !== stored.url || apiKey !== stored.apiKey) seerr = { url, apiKey };
    seerrToTry = !stored || url !== stored.url || (apiKey !== '' && apiKey !== stored.apiKey);
  }

  if (newKey !== null) {
    const check = await checkKey(newKey, checks.listModels);
    if (check === 'refused') return refuse(400, 'Clé refusée par Anthropic');
    if (check === 'unreachable') return refuse(502, 'Impossible de vérifier la clé auprès d’Anthropic');
    changes.apiKey = newKey;
  }
  if (backupToTry) {
    const refusal = await checks.checkS3(backupToTry);
    if (refusal) return refusal;
  }
  if (seerr && seerrToTry) {
    const refusal = await checks.checkSeerr(seerr);
    if (refusal) return refusal;
  }
  if (driveToTry && drive) {
    const found = await checks.checkDrive(driveToTry);
    if (!found.ok) return found;
    const stored = store.drive();
    if (stored && stored.repoId !== found.repoId && store.driveFileCount() > 0) {
      return refuse(400, 'Ce jeton ouvre une autre bibliothèque : désactivez d’abord Seafile pour rapatrier vos fichiers');
    }
    drive = { ...drive, repoId: found.repoId, library: found.library };
  }

  store.update(changes);
  if (pages !== undefined) store.updatePages(pages);
  if (backup !== undefined) store.updateBackup(backup);
  if (seerr !== undefined) store.updateSeerr(seerr);
  if (drive === null) {
    // Its files come back first; the next pass (started at once) forgets it, even with none, so a pass under way stops first.
    if (store.drive()) store.updateDrive({ leaving: true });
  } else if (drive !== undefined) {
    store.updateDrive(drive);
  }
  return { ok: true };
}
