/**
 * HTTP to the suite's server, for every phone app: the sync exchange, file uploads, the server's
 * health and settings, Claude's usage and the Administration. An app's own routes go through
 * `askServer` (Carnet's modules, Pages' questions).
 */
import { APP_IDS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { parseAdminStatus, parseBackupList, parseDownloadTicket, type AdminStatus, type BackupList, type RestoreMode } from '@unlease/core/sync/admin';
import { authHeader, parseSyncResponse, type SyncRequest, type SyncResponse } from '@unlease/core/sync/protocol';
import { parseServerSettings, type ServerSettings, type SettingsPatch } from '@unlease/core/sync/settings';
import type { SyncTransport } from '@unlease/core/sync/engine';

import type { ServerConfig } from '../store/settingsStore';

export class SyncError extends Error {
  constructor(
    readonly kind: 'unauthorized' | 'http' | 'network' | 'protocol' | 'aborted',
    message: string,
    /** The HTTP status, for `http` errors. */
    readonly status: number | null = null,
    /** When the server said to come back (`Retry-After`, in seconds), in milliseconds. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

function retryAfter(response: Response): number | null {
  const value = response.headers?.get?.('Retry-After')?.trim();
  return value && /^\d+$/.test(value) ? Number(value) * 1000 : null;
}

/** Must outlast the server's 25 s long-poll. */
const REQUEST_TIMEOUT_MS = 45_000;
/** A backup archive sent from the phone: the upload ends before the server restores it. */
const RESTORE_UPLOAD_TIMEOUT_MS = 10 * 60_000;

async function request(url: string, init: RequestInit, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (signal?.aborted) throw new SyncError('aborted', 'aborted');
    if (controller.signal.aborted) throw new SyncError('network', t('Le serveur ne répond pas'));
    throw new SyncError('network', unreachable(url));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** fetch's own errors are English and vague. Release builds also refuse plain http (React Native's default). */
function unreachable(url: string): string {
  return !__DEV__ && url.startsWith('http://') ? t('Cette version n’accepte que les adresses https://') : t('Serveur injoignable');
}

function check(response: Response): void {
  if (response.status === 401) throw new SyncError('unauthorized', t('Jeton refusé par le serveur'), 401);
  if (!response.ok) throw new SyncError('http', t('Le serveur a répondu {status}', { status: response.status }), response.status, retryAfter(response));
}

/** `types`: the record types this app syncs (`syncedTypes`), named in every request so the server answers only those. */
export function createTransport(config: ServerConfig, types?: readonly string[]): SyncTransport {
  return {
    async sync(exchange: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
      const body: SyncRequest = types ? { ...exchange, types } : exchange;
      const response = await request(
        `${config.url}/api/sync`,
        {
          method: 'POST',
          headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        signal,
      );
      check(response);
      const parsed = parseSyncResponse(await response.json());
      if (!parsed) throw new SyncError('protocol', t('Réponse du serveur illisible'));
      return parsed;
    },
  };
}

export interface Health {
  readonly ok: boolean;
  readonly analysis: boolean;
  readonly version: string;
  /** The apps the server runs; null from a server older than the suite (it runs Carnet alone). */
  readonly apps: readonly AppId[] | null;
  /** Whether its own setup is done (the apps, « Votre serveur »); null from an older server, which counts as done. */
  readonly setup: boolean | null;
}

/** `/api/health`'s list of apps, as this build knows them. */
function healthApps(value: unknown): AppId[] | null {
  if (!Array.isArray(value)) return null;
  return APP_IDS.filter(id => value.includes(id));
}

/** "Is this the right address, and does it accept this token?" for the settings screen. */
export async function checkServer(config: ServerConfig): Promise<Health> {
  const health = await request(`${config.url}/api/health`, { method: 'GET' });
  check(health);
  const body = (await health.json()) as { ok?: unknown; analysis?: unknown; version?: unknown; apps?: unknown; setup?: unknown };
  // Health needs no token. The server checks the token before any route, so any answer but 401
  // (and 429, which comes before the check) proves it, at the cost of one small read.
  const probe = await request(`${config.url}/api/settings`, { method: 'GET', headers: authHeader(config.token) });
  if (probe.status === 401 || probe.status === 429) check(probe);
  return { ok: body.ok === true, analysis: body.analysis === true, version: String(body.version ?? ''), apps: healthApps(body.apps), setup: typeof body.setup === 'boolean' ? body.setup : null };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
};

/** React Native's FormData streams the file from disk (hence the `Blob` cast). */
export async function uploadFile(config: ServerConfig, file: { id: string; path: string; mime: string }): Promise<void> {
  const form = new FormData();
  form.append('file', {
    uri: file.path.startsWith('file://') ? file.path : `file://${file.path}`,
    type: file.mime,
    name: `${file.id}.${EXTENSIONS[file.mime] ?? 'jpg'}`,
  } as unknown as Blob);
  const response = await request(`${config.url}/api/blobs/${file.id}`, {
    method: 'PUT',
    headers: authHeader(config.token),
    body: form,
  });
  check(response);
}

export async function fetchServerSettings(config: ServerConfig): Promise<ServerSettings | null> {
  try {
    const response = await request(`${config.url}/api/settings`, { method: 'GET', headers: authHeader(config.token) });
    if (!response.ok) return null;
    return parseServerSettings(await response.json());
  } catch {
    return null;
  }
}

/** Statuses whose `error` the server writes in French for the person: a refused setting, nothing set yet, S3 or Seafile out of reach. */
const REFUSALS = [400, 409, 502];

/** Throws with the server's own words when it answers one of `statuses`. */
async function refuse(response: Response, statuses: readonly number[], fallback: string): Promise<void> {
  if (!statuses.includes(response.status)) return;
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  throw new SyncError('http', typeof body.error === 'string' ? t(body.error) : fallback, response.status);
}

/** Throws with the server's own words when it refuses (a wrong key, an S3 bucket or a Seafile out of reach). */
export async function saveServerSettings(config: ServerConfig, patch: SettingsPatch): Promise<ServerSettings> {
  const response = await request(`${config.url}/api/settings`, {
    method: 'PUT',
    headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await refuse(response, [400, 502], t('Réglage refusé'));
  check(response);
  const settings = parseServerSettings(await response.json());
  if (!settings) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return settings;
}

export interface UsageTotals {
  readonly analyses: number;
  readonly costUsd: number;
}

export interface Usage {
  readonly month: UsageTotals;
  readonly total: UsageTotals;
  readonly model: string;
  readonly budgetUsd: number;
}

const totals = (value: unknown): UsageTotals => {
  const raw = (value ?? {}) as Partial<UsageTotals>;
  return { analyses: Number(raw.analyses ?? 0), costUsd: Number(raw.costUsd ?? 0) };
};

export async function fetchUsage(config: ServerConfig): Promise<Usage | null> {
  try {
    const response = await request(`${config.url}/api/usage`, { method: 'GET', headers: authHeader(config.token) });
    if (!response.ok) return null;
    const body = (await response.json()) as { monthToDate?: unknown; total?: unknown; model?: unknown; budgetUsd?: unknown };
    return {
      month: totals(body.monthToDate),
      total: totals(body.total),
      model: String(body.model ?? ''),
      budgetUsd: Number(body.budgetUsd ?? 0),
    };
  } catch {
    return null;
  }
}

/** Statuses whose `error` an app's route writes in French for the person (no key, the budget, Claude's failure, the app off). */
const ROUTE_REFUSALS = [400, 404, 409, 501, 502];

/** A refusal is about that one request (a file the server will not take): anything else is about the network, and backs off. */
export const isRefusal = (error: unknown): boolean =>
  error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

/** Claude sorting a few hundred links, or searching the web; the server gives up sooner, and Cloudflare at 100 s. */
export const LONG_TIMEOUT_MS = 100_000;

/** A POST to an app's route: its answer, or its refusal in the server's own words. */
export async function askServer<T>(config: ServerConfig, path: string, body: unknown, parse: (value: unknown) => T | null, signal?: AbortSignal, timeoutMs = LONG_TIMEOUT_MS): Promise<T> {
  const response = await request(
    `${config.url}${path}`,
    { method: 'POST', headers: { ...authHeader(config.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    signal,
    timeoutMs,
  );
  if (ROUTE_REFUSALS.includes(response.status)) {
    const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (typeof answer.error === 'string') throw new SyncError('http', t(answer.error), response.status);
  }
  check(response);
  const parsed = parse(await response.json().catch(() => null));
  if (parsed === null) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return parsed;
}

/** A GET of an app's route: its answer, or its refusal in the server's own words. */
export async function getFromServer<T>(config: ServerConfig, path: string, parse: (value: unknown) => T | null, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await request(`${config.url}${path}`, { method: 'GET', headers: authHeader(config.token) }, signal, timeoutMs);
  if (ROUTE_REFUSALS.includes(response.status)) {
    const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (typeof answer.error === 'string') throw new SyncError('http', t(answer.error), response.status);
  }
  check(response);
  const parsed = parse(await response.json().catch(() => null));
  if (parsed === null) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return parsed;
}

/** `GET /api/admin`: what the server holds, and how its backups, its drive and a restore are doing. */
export async function fetchAdminStatus(config: ServerConfig): Promise<AdminStatus | null> {
  try {
    const response = await request(`${config.url}/api/admin`, { method: 'GET', headers: authHeader(config.token) });
    if (!response.ok) return null;
    return parseAdminStatus(await response.json());
  } catch {
    return null;
  }
}

/** `GET /api/admin/backups`, newest first. Throws with the server's words without S3 (409) or when S3 fails (502). */
export async function fetchBackups(config: ServerConfig): Promise<BackupList> {
  const response = await request(`${config.url}/api/admin/backups`, { method: 'GET', headers: authHeader(config.token) });
  await refuse(response, REFUSALS, t('Sauvegardes indisponibles'));
  check(response);
  const list = parseBackupList(await response.json().catch(() => null));
  if (!list) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return list;
}

/** A POST that starts something on the server and answers its status (202). */
async function startAdmin(config: ServerConfig, path: string, init: { readonly body?: string } = {}): Promise<AdminStatus | null> {
  const response = await request(`${config.url}${path}`, {
    method: 'POST',
    headers: { ...authHeader(config.token), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body,
  });
  await refuse(response, REFUSALS, t('Action refusée'));
  check(response);
  return parseAdminStatus(await response.json().catch(() => null));
}

/** `POST /api/admin/backups`: a backup now. */
export function startBackup(config: ServerConfig): Promise<AdminStatus | null> {
  return startAdmin(config, '/api/admin/backups');
}

/** `POST /api/admin/drive/sync`: a pass over the drive now. */
export function startDriveSync(config: ServerConfig): Promise<AdminStatus | null> {
  return startAdmin(config, '/api/admin/drive/sync');
}

/** Restores a snapshot the server reads from S3. */
export function restoreSnapshot(config: ServerConfig, name: string, mode: RestoreMode): Promise<AdminStatus | null> {
  return startAdmin(config, `/api/admin/restore?mode=${mode}`, { body: JSON.stringify({ snapshot: name }) });
}

/** Sends an archive from the phone's storage; the server restores it once the upload is in. */
export async function restoreFile(config: ServerConfig, path: string, name: string, mode: RestoreMode): Promise<AdminStatus | null> {
  const form = new FormData();
  form.append('file', { uri: path.startsWith('file://') ? path : `file://${path}`, type: 'application/gzip', name } as unknown as Blob);
  const response = await request(`${config.url}/api/admin/restore?mode=${mode}`, { method: 'POST', headers: authHeader(config.token), body: form }, undefined, RESTORE_UPLOAD_TIMEOUT_MS);
  await refuse(response, REFUSALS, t('Restauration refusée'));
  check(response);
  return parseAdminStatus(await response.json().catch(() => null));
}

/** An address that downloads a snapshot from S3, or a full archive with the files, without the token: the browser opens it. */
export async function requestDownload(config: ServerConfig, what: { readonly snapshot: string } | { readonly full: true }): Promise<{ readonly url: string; readonly name: string }> {
  const response = await request(`${config.url}/api/admin/downloads`, {
    method: 'POST',
    headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(what),
  });
  await refuse(response, [...REFUSALS, 501], t('Téléchargement refusé'));
  check(response);
  const ticket = parseDownloadTicket(await response.json().catch(() => null));
  if (!ticket) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return { url: `${config.url}${ticket.url}`, name: ticket.name };
}
