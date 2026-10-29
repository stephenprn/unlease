/**
 * HTTP to the Carnet server: the sync exchange, photo and file uploads and downloads, the
 * health check, the analysis usage, sorting by Claude, promo codes and the Administration (backups,
 * the drive, restoring). The same calls as the phone's `src/app/sync/transport.ts`, over the browser's `fetch`.
 *
 * Every request carries the bearer token, so images cannot be plain `<img src>`:
 * they are fetched here and shown through object URLs (`app/media/images`).
 */
import { APP_NAME } from '@unlease/notes/brand';
import { t } from '@unlease/core/i18n';
import { parseAdminStatus, parseBackupList, parseDownloadTicket, type AdminStatus, type BackupList, type RestoreMode } from '@unlease/core/sync/admin';
import { authHeader, parseSyncResponse, type SyncRequest, type SyncResponse } from '@unlease/core/sync/protocol';
import { parseAskResponse, type AskRequest, type AskResponse } from '@unlease/notes/sync/ask';
import { parsePagesAskResponse, type PagesAskRequest, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
import { parseCopyResponse, type CopyRequest, type CopyResponse } from '@unlease/notes/sync/copies';
import { parseCouponResponse, type CouponRequest, type CouponResponse } from '@unlease/notes/sync/coupons';
import { parseCoverageResponse, type CoverageRequest, type CoverageResponse } from '@unlease/notes/sync/coverage';
import { parseOfferResponse, type OfferRequest, type OfferResponse } from '@unlease/notes/sync/offers';
import { parseRecipeResponse, type RecipeRequest, type RecipeResponse } from '@unlease/notes/sync/recipe';
import { parseSeerrResponse, type SeerrRequest, type SeerrResponse } from '@unlease/notes/sync/seerr';
import { parseRatingsResponse, parseRecapResponse, type RatingsRequest, type RatingsResponse, type RecapRequest, type RecapResponse } from '@unlease/notes/sync/works';
import { parseServerSettings, type ServerSettings, type SettingsPatch } from '@unlease/core/sync/settings';
import { parseSortResponse, type SortRequest, type SortResponse } from '@unlease/notes/sync/sorting';
import type { SyncTransport } from '@unlease/core/sync/engine';

import type { ServerConfig } from '../store/settings';

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

/** Longer than the server's 25 s long-poll, shorter than forever. */
const REQUEST_TIMEOUT_MS = 45_000;
/** Claude sorting a few hundred links, or searching the web for promo codes; the server gives up sooner, and Cloudflare at 100 s. */
const SORT_TIMEOUT_MS = 100_000;

async function request(url: string, init: RequestInit, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: init.cache ?? 'no-store' });
  } catch {
    if (signal?.aborted) throw new SyncError('aborted', 'aborted');
    if (controller.signal.aborted) throw new SyncError('network', t('Le serveur ne répond pas'));
    throw new SyncError('network', unreachable(url));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** fetch's own errors are English and vague; an https page cannot reach an http address at all. */
function unreachable(url: string): string {
  return location.protocol === 'https:' && url.startsWith('http://') ? t('Une page https ne peut pas joindre une adresse http://') : t('Serveur injoignable');
}

function check(response: Response): void {
  if (response.status === 401) throw new SyncError('unauthorized', t('Jeton refusé par le serveur'), 401);
  if (response.status === 429) throw new SyncError('http', t('Trop de tentatives, réessayez dans une minute'), 429, retryAfter(response));
  if (!response.ok) throw new SyncError('http', t('Le serveur a répondu {status}', { status: response.status }), response.status, retryAfter(response));
}

/** Browsers refuse a `keepalive` request over 64 KB (all of them in flight together). */
const KEEPALIVE_LIMIT = 60_000;

/** `keepalive`: the request outlives the page (the last push as a tab closes), when it is small enough. */
export function createTransport(config: ServerConfig, options: { keepalive?: boolean } = {}): SyncTransport {
  return {
    async sync(body: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
      const payload = JSON.stringify(body);
      const response = await request(
        `${config.url}/api/sync`,
        {
          method: 'POST',
          headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
          body: payload,
          keepalive: options.keepalive === true && payload.length * 3 < KEEPALIVE_LIMIT,
        },
        signal,
      );
      check(response);
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw new SyncError('protocol', t('Réponse du serveur illisible'));
      }
      const parsed = parseSyncResponse(json);
      if (!parsed) throw new SyncError('protocol', t('Réponse du serveur illisible'));
      return parsed;
    },
  };
}

export interface Health {
  readonly ok: boolean;
  readonly analysis: boolean;
  readonly version: string;
}

/** "Is this the right address, and does it accept this token?" for setup and settings. */
/** True when the app was served by a server of its own (the image serving both): its address is this page's. */
export async function servedByServer(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
    const body = (await response.json()) as { ok?: unknown; apiVersion?: unknown };
    return body.ok === true && typeof body.apiVersion === 'number';
  } catch {
    return false;
  }
}

export async function checkServer(config: ServerConfig): Promise<Health> {
  const health = await request(`${config.url}/api/health`, { method: 'GET' }, undefined, 15_000);
  check(health);
  const body = (await health.json().catch(() => {
    throw new SyncError('protocol', t('Cette adresse ne répond pas comme un serveur {app}', { app: APP_NAME }));
  })) as Partial<Health>;
  // Health needs no token. The server checks the token before any route, so any answer but 401
  // (and 429, which comes before the check) proves it, at the cost of one small read.
  const probe = await request(`${config.url}/api/settings`, { method: 'GET', headers: authHeader(config.token) }, undefined, 15_000);
  if (probe.status === 401 || probe.status === 429) check(probe);
  return { ok: body.ok === true, analysis: body.analysis === true, version: String(body.version ?? '') };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
};

/** Send one photo as multipart, the field the server reads being `file`. */
export async function uploadBlob(config: ServerConfig, id: string, blob: Blob, mime: string): Promise<void> {
  const form = new FormData();
  form.append('file', blob, `${id}.${EXTENSIONS[mime] ?? 'jpg'}`);
  const response = await request(`${config.url}/api/blobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeader(config.token),
    body: form,
  });
  check(response);
}

/** A page's video, PDF or file, kept by the server as it is (`PUT /api/files`). */
export async function uploadFile(config: ServerConfig, id: string, blob: Blob, mime: string): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([blob], { type: mime }), id);
  const response = await request(`${config.url}/api/files/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeader(config.token),
    body: form,
  });
  check(response);
}

/** One image, as bytes. The server marks them immutable, so the browser cache keeps them. */
export async function downloadBlob(config: ServerConfig, id: string, variant: 'display' | 'original', signal?: AbortSignal): Promise<Blob> {
  const response = await request(
    `${config.url}/api/blobs/${encodeURIComponent(id)}?variant=${variant}`,
    { method: 'GET', headers: authHeader(config.token), cache: 'default' },
    signal,
  );
  check(response);
  return response.blob();
}

/** `GET /api/settings`: whether links are read, by which model, within what budget. */
export async function fetchServerSettings(config: ServerConfig): Promise<ServerSettings | null> {
  try {
    const response = await request(`${config.url}/api/settings`, { method: 'GET', headers: authHeader(config.token) }, undefined, 15_000);
    if (!response.ok) return null;
    return parseServerSettings(await response.json());
  } catch {
    return null;
  }
}

/** Throws with the server's own French words when it answers one of `statuses` with `{ error }`. */
async function refusal(response: Response, statuses: readonly number[], fallback: string): Promise<void> {
  if (!statuses.includes(response.status)) return;
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  throw new SyncError('http', typeof body.error === 'string' ? t(body.error) : fallback, response.status);
}

/**
 * `PUT /api/settings`. Throws with the server's own words when it refuses (a wrong key) or cannot
 * reach what it tries (Anthropic, S3, Seafile): a new connection is tested before it is kept.
 */
export async function saveServerSettings(config: ServerConfig, patch: SettingsPatch): Promise<ServerSettings> {
  const response = await request(
    `${config.url}/api/settings`,
    {
      method: 'PUT',
      headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    undefined,
    45_000,
  );
  await refusal(response, [400, 502], t('Réglage refusé'));
  check(response);
  const settings = parseServerSettings(await response.json().catch(() => null));
  if (!settings) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return settings;
}

export interface Usage {
  readonly month: { readonly analyses: number; readonly costUsd: number };
  readonly total: { readonly analyses: number; readonly costUsd: number };
  readonly model: string;
  readonly budgetUsd: number;
}

function totals(value: unknown): { analyses: number; costUsd: number } | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { analyses?: unknown; costUsd?: unknown };
  if (typeof raw.analyses !== 'number' || typeof raw.costUsd !== 'number') return null;
  return { analyses: raw.analyses, costUsd: raw.costUsd };
}

/** Claude spending. The server names this month `monthToDate`; older builds said `month`. */
export async function fetchUsage(config: ServerConfig): Promise<Usage | null> {
  try {
    const response = await request(`${config.url}/api/usage`, { method: 'GET', headers: authHeader(config.token) }, undefined, 15_000);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const month = totals(body.monthToDate) ?? totals(body.month);
    const total = totals(body.total);
    if (!month || !total) return null;
    return {
      month,
      total,
      model: typeof body.model === 'string' ? body.model : '',
      budgetUsd: typeof body.budgetUsd === 'number' ? body.budgetUsd : 0,
    };
  } catch {
    return null;
  }
}

/** Statuses whose `error` the sort route writes in French for the person (no key, the budget, Claude's failure). */
const SORT_REFUSALS = [400, 409, 501, 502];

/** `POST /api/sort`: Claude's moves for links already saved. Throws with the server's own words when it refuses. */
export async function sortLinks(config: ServerConfig, body: SortRequest, signal?: AbortSignal): Promise<SortResponse> {
  const response = await request(
    `${config.url}/api/sort`,
    {
      method: 'POST',
      headers: { ...authHeader(config.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    signal,
    SORT_TIMEOUT_MS,
  );
  if (SORT_REFUSALS.includes(response.status)) {
    const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (typeof answer.error === 'string') throw new SyncError('http', t(answer.error), response.status);
  }
  check(response);
  const parsed = parseSortResponse(await response.json().catch(() => null));
  if (!parsed) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return parsed;
}

/** `POST /api/coupons`: the promo codes Claude found on the web for a priced link. Throws with the server's own words when it refuses. */
export async function searchCoupons(config: ServerConfig, body: CouponRequest, signal?: AbortSignal): Promise<CouponResponse> {
  return askModule(config, '/api/coupons', body, parseCouponResponse, signal);
}

/** `POST /api/offers`: the same item at other shops (`new`) or second-hand (`used`), as Claude found it. */
export async function searchOffers(config: ServerConfig, body: OfferRequest, signal?: AbortSignal): Promise<OfferResponse> {
  return askModule(config, '/api/offers', body, parseOfferResponse, signal);
}

/** `POST /api/recipe`: a recipe's ingredients and method, for a shopping list and the cook mode. */
export async function fetchRecipe(config: ServerConfig, body: RecipeRequest, signal?: AbortSignal): Promise<RecipeResponse> {
  return askModule(config, '/api/recipe', body, parseRecipeResponse, signal);
}

/** `POST /api/copies`: an article as blocks to keep in a page, its pictures already kept by the server. */
export async function requestCopy(config: ServerConfig, body: CopyRequest, signal?: AbortSignal): Promise<CopyResponse> {
  return askModule(config, '/api/copies', body, parseCopyResponse, signal);
}

/** `POST /api/ratings`: a work's ratings on the sites that rate its kind, as Claude found them. */
export async function searchRatings(config: ServerConfig, body: RatingsRequest, signal?: AbortSignal): Promise<RatingsResponse> {
  return askModule(config, '/api/ratings', body, parseRatingsResponse, signal);
}

/** `POST /api/recap`: a series up to where the person stopped, nothing after. */
export async function searchRecap(config: ServerConfig, body: RecapRequest, signal?: AbortSignal): Promise<RecapResponse> {
  return askModule(config, '/api/recap', body, parseRecapResponse, signal);
}

/** `POST /api/coverage`: the same story told by other outlets. */
export async function searchCoverage(config: ServerConfig, body: CoverageRequest, signal?: AbortSignal): Promise<CoverageResponse> {
  return askModule(config, '/api/coverage', body, parseCoverageResponse, signal);
}

/** `POST /api/ask`: Claude's answer to a question about a link, and the pages it cites. */
export async function askQuestion(config: ServerConfig, body: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  return askModule(config, '/api/ask', body, parseAskResponse, signal);
}

/** `POST /api/pages/ask`: a question about pages, answered from them, each claim with the blocks it rests on. */
export async function askAboutPages(config: ServerConfig, body: PagesAskRequest, signal?: AbortSignal): Promise<PagesAskResponse> {
  return askModule(config, '/api/pages/ask', body, parsePagesAskResponse, signal);
}

/** `POST /api/seerr`: a film or a series in Seerr, its page and state, or Seerr's search for it. */
export async function findInSeerr(config: ServerConfig, body: SeerrRequest, signal?: AbortSignal): Promise<SeerrResponse> {
  return askModule(config, '/api/seerr', body, parseSeerrResponse, signal, 20_000);
}

/** A link module's call: its answer, or its refusal in the server's own words. */
async function askModule<T>(config: ServerConfig, path: string, body: unknown, parse: (value: unknown) => T | null, signal?: AbortSignal, timeoutMs = SORT_TIMEOUT_MS): Promise<T> {
  const response = await request(
    `${config.url}${path}`,
    { method: 'POST', headers: { ...authHeader(config.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    signal,
    timeoutMs,
  );
  if (SORT_REFUSALS.includes(response.status)) {
    const answer = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (typeof answer.error === 'string') throw new SyncError('http', t(answer.error), response.status);
  }
  check(response);
  const parsed = parse(await response.json().catch(() => null));
  if (parsed === null) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return parsed;
}

/** The Administration's refusals: a missing S3, a restore already running, S3 or the drive failing. */
const ADMIN_REFUSALS = [400, 409, 501, 502];

/** `GET /api/admin`: what the server holds, its backups, its drive, the last restore. Null when it does not answer. */
export async function fetchAdminStatus(config: ServerConfig): Promise<AdminStatus | null> {
  try {
    const response = await request(`${config.url}/api/admin`, { method: 'GET', headers: authHeader(config.token) }, undefined, 15_000);
    if (!response.ok) return null;
    return parseAdminStatus(await response.json());
  } catch {
    return null;
  }
}

async function adminStatusOf(response: Response, fallback: string): Promise<AdminStatus> {
  await refusal(response, ADMIN_REFUSALS, fallback);
  check(response);
  const status = parseAdminStatus(await response.json().catch(() => null));
  if (!status) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return status;
}

/** `GET /api/admin/backups`: the snapshots on S3, newest first. */
export async function fetchBackups(config: ServerConfig): Promise<BackupList> {
  const response = await request(`${config.url}/api/admin/backups`, { method: 'GET', headers: authHeader(config.token) }, undefined, 30_000);
  await refusal(response, ADMIN_REFUSALS, t('Sauvegardes indisponibles'));
  check(response);
  const list = parseBackupList(await response.json().catch(() => null));
  if (!list) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return list;
}

/** `POST /api/admin/backups`: a backup starts now; the status says when it is done. */
export async function startBackup(config: ServerConfig): Promise<AdminStatus> {
  const response = await request(`${config.url}/api/admin/backups`, { method: 'POST', headers: authHeader(config.token) }, undefined, 15_000);
  return adminStatusOf(response, t('Sauvegarde refusée'));
}

/** `POST /api/admin/drive/sync`: a pass over the drive starts now. */
export async function startDriveSync(config: ServerConfig): Promise<AdminStatus> {
  const response = await request(`${config.url}/api/admin/drive/sync`, { method: 'POST', headers: authHeader(config.token) }, undefined, 15_000);
  return adminStatusOf(response, t('Synchronisation refusée'));
}

/** `POST /api/admin/restore`: restores one of the snapshots on S3, in the background. */
export async function restoreSnapshot(config: ServerConfig, snapshot: string, mode: RestoreMode): Promise<AdminStatus> {
  const response = await request(
    `${config.url}/api/admin/restore?mode=${mode}`,
    { method: 'POST', headers: { ...authHeader(config.token), 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) },
    undefined,
    30_000,
  );
  return adminStatusOf(response, t('Restauration refusée'));
}

/** A big archive takes a while to send; the restore itself runs afterwards, on the server. */
const RESTORE_UPLOAD_TIMEOUT_MS = 10 * 60_000;

/** `POST /api/admin/restore`: sends an archive kept elsewhere (`.tar.gz`), then restores it in the background. */
export async function restoreFile(config: ServerConfig, file: Blob, mode: RestoreMode): Promise<AdminStatus> {
  const response = await request(
    `${config.url}/api/admin/restore?mode=${mode}`,
    { method: 'POST', headers: { ...authHeader(config.token), 'Content-Type': 'application/gzip' }, body: file },
    undefined,
    RESTORE_UPLOAD_TIMEOUT_MS,
  );
  // The server's limit or Cloudflare's (100 MB a request through a tunnel) answers in English, if at all.
  if (response.status === 413) throw new SyncError('http', t('Archive trop lourde pour être envoyée : restaurez-la depuis S3.'), 413);
  return adminStatusOf(response, t('Restauration refusée'));
}

/**
 * `POST /api/admin/downloads`: a short-lived address for one snapshot, or for a full archive with the
 * files, that the browser opens without the token (a download it manages itself, whatever the size).
 */
export async function requestDownload(config: ServerConfig, what: { readonly snapshot: string } | { readonly full: true }): Promise<{ readonly url: string; readonly name: string }> {
  const response = await request(
    `${config.url}/api/admin/downloads`,
    { method: 'POST', headers: { ...authHeader(config.token), 'Content-Type': 'application/json' }, body: JSON.stringify(what) },
    undefined,
    30_000,
  );
  await refusal(response, ADMIN_REFUSALS, t('Téléchargement refusé'));
  check(response);
  const ticket = parseDownloadTicket(await response.json().catch(() => null));
  if (!ticket) throw new SyncError('protocol', t('Réponse du serveur illisible'));
  return { url: `${config.url}${ticket.url}`, name: ticket.name };
}
