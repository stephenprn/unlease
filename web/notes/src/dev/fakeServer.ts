/**
 * A Carnet server in the page, for the dev demo only: `fetch` to the demo
 * address is answered here, so the real transport, sync loop and image cache
 * run unchanged. It merges and sequences records with core's own merge, holds
 * long-polls, and "reads" pending links after a pause, filing them on a line
 * by keyword, the way the real server's analysis writes its results. Sorting
 * (`/api/sort`) files by the words a collection's name and sentence share with a link; the link
 * modules pretend too: promo codes (`/api/coupons`), offers elsewhere (`/api/offers`), a recipe's
 * ingredients and method (`/api/recipe`), an article's copy (`/api/copies`), ratings
 * (`/api/ratings`), a recap (`/api/recap`), other outlets (`/api/coverage`), answers
 * (`/api/ask`) and a Seerr that has some films (`/api/seerr`), all made up.
 * Photos and a page's files (`/api/blobs`, `/api/files`) are kept in memory for the visit.
 * The Administration's routes (`/api/admin…`) pretend too: backups to an S3 that is a list in
 * memory, a Seafile that takes any long enough token, restores that report what the demo holds.
 */
import { foldText } from '@unlease/core/services/search';
import { MAX_PULL, type SyncResponse } from '@unlease/core/sync/protocol';
import { parseSyncRequest } from '@unlease/core/sync/protocol';
import { parseSortRequest, type SortLink, type SortMove, type SortTarget } from '@unlease/notes/sync/sorting';
import { parseAskRequest } from '@unlease/notes/sync/ask';
import { parsePagesAskRequest, requestChars, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
import { parseCopyRequest } from '@unlease/notes/sync/copies';
import { parseCouponRequest } from '@unlease/notes/sync/coupons';
import { parseCoverageRequest } from '@unlease/notes/sync/coverage';
import { parseOfferRequest } from '@unlease/notes/sync/offers';
import { parseRecipeRequest } from '@unlease/notes/sync/recipe';
import { parseSeerrRequest } from '@unlease/notes/sync/seerr';
import { parseRatingsRequest, parseRecapRequest } from '@unlease/notes/sync/works';
import { seerrPageUrl, seerrSearchUrl } from '@unlease/notes/services/modules';
import { createClock, tick } from '@unlease/core/sync/hlc';
import { mergeRecord, writeFields, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { linkFromRecord } from '@unlease/notes/sync/entities';
import type { LinkAttribute, LinkKind } from '@unlease/notes/models/entities';
import { isRestoreMode, type AdminStatus, type BackupRun, type BackupSnapshot, type RestoreStatus } from '@unlease/core/sync/admin';
import { PAGES_ASK_DEFAULTS, PAGES_REACH_CHARS, BACKUP_KEEP_MAX, DRIVE_FOLDER_DEFAULT, isBackupRecurrence, isClaudeModel, isPagesReach, type BackupSettings, type DriveSettings, type PagesAskSettings, type SeerrSettings, type ServerSettings } from '@unlease/core/sync/settings';

import { demoImage } from './demoImages';

export const DEMO_SERVER = 'https://carnet.maison.example';

interface Stored {
  record: SyncRecord;
  seq: number;
}

interface Reading {
  readonly match: RegExp;
  readonly lineId: string | null;
  readonly kind: LinkKind;
  readonly siteName: string;
  readonly title: string;
  readonly summary: string;
  readonly price: number | null;
  readonly attributes: readonly LinkAttribute[];
  readonly imageIds: readonly string[];
}

/** What the pretend Claude reads, by URL. */
const READINGS: readonly Reading[] = [
  {
    match: /phares/,
    lineId: 'line-films',
    kind: 'film',
    siteName: 'Cinéma Lumière',
    title: 'La Nuit des phares',
    summary: 'Un gardien de phare et sa fille, une tempête, une nuit entière pour rallumer la lanterne. Premier film d’une réalisatrice bretonne.',
    price: null,
    attributes: [
      { label: 'Durée', value: '1 h 48' },
      { label: 'Sortie', value: 'Novembre' },
    ],
    imageIds: ['demo-poster3'],
  },
  {
    match: /bonnet/,
    lineId: 'line-mode',
    kind: 'product',
    siteName: 'Maille & Fil',
    title: 'Bonnet en côtes anglaises',
    summary: 'Bonnet en laine mérinos, maille côtes anglaises, revers large.',
    price: 39,
    attributes: [{ label: 'Couleur', value: 'Gris chiné' }],
    imageIds: [],
  },
  {
    match: /lampe|luminaire/,
    lineId: 'line-maison',
    kind: 'product',
    siteName: 'Maison Clair',
    title: 'Applique murale en laiton',
    summary: 'Applique orientable en laiton brossé, abat-jour conique.',
    price: 119,
    attributes: [{ label: 'Finition', value: 'Laiton brossé' }],
    imageIds: ['demo-lamp-2'],
  },
];

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

/** Words long enough to mean something ("pour", "dans" do not), folded. */
const words = (text: string): string[] => foldText(text).split(/[^a-z0-9]+/).filter(word => word.length > 4);

/** The pretend Claude's idea of a fit: the link's reading by address, else a word of the collection's name or sentence in it. */
function fits(link: SortLink, target: SortTarget): boolean {
  const known = READINGS.find(entry => entry.match.test(link.url));
  if (known?.lineId) return known.lineId === target.id;
  const about = words(`${link.title} ${link.summary} ${link.site} ${link.facts.join(' ')}`);
  return words(`${target.title} ${target.hint}`).some(word => about.some(other => other.startsWith(word.slice(0, 5))));
}

/** What a key looks like; the real server asks Anthropic instead. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

const HOUR = 3_600_000;

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const snapshotName = (time: number): string => `carnet-${new Date(time).toISOString().slice(0, 19).replace(/:/g, '-')}Z.tar.gz`;

const hint = (secret: string): string => `…${secret.slice(-4)}`;

export class FakeServer {
  /** Link reading: on, with a key set from the apps, unless the demo asks for it off. */
  private settings: ServerSettings['analysis'];
  /** Questions about the pages: on in the demo when it reads links, so they can be tried. */
  private pages: PagesAskSettings;

  constructor({ reading = true }: { reading?: boolean } = {}) {
    this.settings = reading
      ? { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 }
      : { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 };
    this.pages = { ...PAGES_ASK_DEFAULTS, enabled: reading };
  }

  private readonly records = new Map<string, Stored>();
  private seq = 0;
  private readonly waiters = new Set<() => void>();
  private readonly clock = createClock('demoserver');
  private readonly reading = new Set<string>();
  /** What was uploaded this visit, served back as the real server would. */
  private readonly uploads = new Map<string, Blob>();

  /** The Administration: an S3 already set, with a few snapshots; Seafile off. */
  private backup: BackupSettings = {
    configured: true,
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    bucket: 'sauvegardes-maison',
    prefix: 'notes/',
    accessKeyId: 'SCWDEMO7Q2K4M8XP1ZTA',
    secretHint: '…9f2c',
    recurrence: 'daily',
    keep: 30,
  };
  private drive: DriveSettings = { provider: null, url: '', folder: DRIVE_FOLDER_DEFAULT, library: null, tokenHint: null, leaving: false };
  private seerr: SeerrSettings = { url: 'https://seerr.maison.example', keyHint: '…7d1e' };
  private snapshots: BackupSnapshot[] = [3, 27, 51].map(hours => {
    const at = Date.now() - hours * HOUR;
    return { name: snapshotName(at), at, bytes: 180_000 + hours * 1_200 };
  });
  private lastRun: BackupRun | null = { startedAt: Date.now() - 3 * HOUR - 40_000, finishedAt: Date.now() - 3 * HOUR, ok: true, error: null, snapshot: null, bytes: 183_600, filesSent: 4, trigger: 'schedule' };
  private backupRunning = false;
  private driveRunning = false;
  private driveFiles = 0;
  private driveLastPass: number | null = null;
  private restore: RestoreStatus = { running: false, startedAt: null, finishedAt: null, error: null, report: null };

  private notify(): void {
    for (const wake of [...this.waiters]) wake();
  }

  private put(record: SyncRecord): void {
    this.seq += 1;
    this.records.set(`${record.type}:${record.id}`, { record, seq: this.seq });
  }

  /** The server's own write (the analysis): one clock for the whole patch. */
  write(type: SyncRecord['type'], id: string, patch: Fields): void {
    const key = `${type}:${id}`;
    const current = this.records.get(key)?.record ?? { type, id, fields: {}, clocks: {} };
    this.put(writeFields(current, patch, tick(this.clock, Date.now())));
    this.notify();
  }

  push(records: readonly SyncRecord[]): void {
    let changed = false;
    for (const incoming of records) {
      const key = `${incoming.type}:${incoming.id}`;
      const merged = mergeRecord(this.records.get(key)?.record, incoming);
      if (merged.changed) {
        this.put(merged.record);
        changed = true;
      }
      const record = this.records.get(key)?.record;
      if (record?.type === 'link' && record.fields.status === 'pending' && record.fields.deletedAt === null) this.read(record.id);
    }
    if (changed) this.notify();
  }

  pull(since: number): SyncResponse {
    const rows = [...this.records.values()].filter(row => row.seq > since).sort((a, b) => a.seq - b.seq);
    const page = rows.slice(0, MAX_PULL);
    return {
      records: page.map(row => row.record),
      cursor: page.length > 0 ? page[page.length - 1]!.seq : since,
      more: rows.length > MAX_PULL,
      serverTime: Date.now(),
    };
  }

  private read(linkId: string): void {
    // Without a key nothing is read: links wait, and the apps mark new ones "skipped".
    if (!this.settings.enabled || this.reading.has(linkId)) return;
    const stored = this.records.get(`link:${linkId}`);
    if (!stored) return;
    const link = linkFromRecord(stored.record);
    // A link whose address says "lent" stays in reading, for screenshots of that state.
    if (/lent/.test(link.url)) return;
    this.reading.add(linkId);
    setTimeout(() => {
      this.reading.delete(linkId);
      const current = linkFromRecord(this.records.get(`link:${linkId}`)!.record);
      if (current.status !== 'pending' || current.deletedAt !== null) return;
      if (/echec|fermee/.test(current.url)) {
        this.write('link', linkId, { status: 'failed', error: 'La page refuse les robots.', analyzedAt: Date.now() });
        return;
      }
      const found = READINGS.find(entry => entry.match.test(current.url));
      const line = found?.lineId && this.records.has(`note:${found.lineId}`) ? found.lineId : null;
      const patch: Fields = {
        status: 'ready',
        title: current.title || found?.title || 'Page sans titre',
        summary: found?.summary ?? '',
        siteName: found?.siteName ?? '',
        kind: found?.kind ?? 'other',
        price: found?.price ?? null,
        currency: typeof found?.price === 'number' ? 'EUR' : null,
        attributes: (found?.attributes ?? []).map(a => ({ ...a })),
        imageIds: [...(found?.imageIds ?? [])],
        analyzedAt: Date.now(),
        error: null,
      };
      if (current.autoFile) {
        patch.autoFile = false;
        if (line) {
          patch.noteId = line;
          patch.filedBy = 'claude';
        }
      }
      this.write('link', linkId, patch);
    }, 3_200);
  }

  private async exchange(body: unknown, signal: AbortSignal | undefined): Promise<SyncResponse> {
    const { request } = parseSyncRequest(body);
    if (!request) throw new Error('bad request');
    await delay(90, signal);
    if (request.records.length > 0) this.push(request.records);
    let response = this.pull(request.since);
    if (response.records.length === 0 && request.wait) {
      await new Promise<void>((resolve, reject) => {
        const done = (): void => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, request.wait);
        this.waiters.add(done);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
      response = this.pull(request.since);
    }
    return response;
  }

  /** `PUT /api/settings`: a key that does not look right is refused in French, as the server does. */
  private async updateSettings(body: Record<string, unknown>): Promise<Response> {
    await delay(450);
    const next = { ...this.settings };
    if ('anthropicApiKey' in body) {
      const key = body.anthropicApiKey;
      if (key === null) {
        if (next.keySource === 'app') Object.assign(next, { enabled: false, keySource: null, keyHint: null });
      } else if (typeof key === 'string' && KEY_SHAPE.test(key.trim())) {
        Object.assign(next, { enabled: true, keySource: 'app', keyHint: `…${key.trim().slice(-4)}` });
      } else {
        return new Response(JSON.stringify({ error: 'Anthropic refuse cette clé : vérifiez qu’elle est complète et toujours active.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    if (isClaudeModel(body.model)) next.model = body.model;
    if (typeof body.budgetUsd === 'number' && Number.isFinite(body.budgetUsd) && body.budgetUsd >= 0) next.budgetUsd = body.budgetUsd;
    const turnedOn = next.enabled && !this.settings.enabled;
    this.settings = next;
    // A key just set: whatever was waiting is read now.
    if (turnedOn) {
      for (const { record } of this.records.values()) {
        if (record.type === 'link' && record.fields.status === 'pending') this.read(record.id);
      }
    }
    if ('pages' in body) {
      const patch = body.pages as Record<string, unknown> | null;
      if (typeof patch !== 'object' || patch === null) return jsonResponse({ error: 'Requête invalide' }, 400);
      const pages = { ...this.pages };
      for (const name of ['enabled', 'everywhere', 'web'] as const) {
        if (patch[name] === undefined) continue;
        if (typeof patch[name] !== 'boolean') return jsonResponse({ error: 'Requête invalide' }, 400);
        pages[name] = patch[name];
      }
      if (patch.reach !== undefined) {
        if (!isPagesReach(patch.reach)) return jsonResponse({ error: 'Requête invalide' }, 400);
        pages.reach = patch.reach;
      }
      this.pages = pages;
    }
    if ('backup' in body) {
      const refused = this.updateBackup(body.backup);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    if ('drive' in body) {
      const refused = this.updateDrive(body.drive);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    if ('seerr' in body) {
      const refused = this.updateSeerr(body.seerr);
      if (refused) return jsonResponse({ error: refused }, 400);
    }
    return jsonResponse(this.settingsView());
  }

  private settingsView(): ServerSettings {
    return { analysis: this.settings, pages: this.pages, backup: this.backup, drive: this.drive, seerr: this.seerr };
  }

  /** The Seerr part of `PUT /api/settings`: any http(s) address answers, any long enough key opens it. */
  private updateSeerr(patch: unknown): string | null {
    if (patch === null) {
      this.seerr = { url: '', keyHint: null };
      return null;
    }
    if (typeof patch !== 'object') return 'Requête invalide';
    const raw = patch as { url?: unknown; apiKey?: unknown };
    let url = this.seerr.url;
    if (raw.url !== undefined) {
      if (typeof raw.url !== 'string' || !/^https?:\/\/[^\s/?#]+[^\s?#]*$/i.test(raw.url.trim())) return 'Adresse Seerr invalide';
      url = raw.url.trim().replace(/\/+$/, '');
    }
    if (!url) return 'Renseignez l’adresse de Seerr';
    let keyHint = this.seerr.keyHint;
    if (raw.apiKey !== undefined) {
      const key = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : null;
      if (key === null || (key !== '' && !/^[!-~]{8,300}$/.test(key))) return 'Clé API invalide';
      keyHint = key ? `…${key.slice(-4)}` : null;
    }
    this.seerr = { url, keyHint };
    return null;
  }

  /** The S3 part of `PUT /api/settings`, checked as the server would (without asking any bucket). Returns the refusal, if any. */
  private updateBackup(patch: unknown): string | null {
    if (patch === null) {
      this.backup = { ...this.backup, configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null };
      return null;
    }
    if (typeof patch !== 'object') return 'Requête invalide';
    const raw = patch as Record<string, unknown>;
    const next = { ...this.backup };
    for (const field of ['endpoint', 'region', 'bucket', 'prefix', 'accessKeyId'] as const) if (typeof raw[field] === 'string') next[field] = raw[field].trim();
    const secret = typeof raw.secretAccessKey === 'string' ? raw.secretAccessKey.trim() : '';
    if (!next.secretHint && !secret) return 'Clé secrète manquante';
    if (next.endpoint && !/^https?:\/\/[^/]+$/.test(next.endpoint)) return 'Adresse du service invalide';
    if (secret) next.secretHint = hint(secret);
    if (isBackupRecurrence(raw.recurrence)) next.recurrence = raw.recurrence;
    if (typeof raw.keep === 'number' && Number.isInteger(raw.keep) && raw.keep >= 1 && raw.keep <= BACKUP_KEEP_MAX) next.keep = raw.keep;
    next.configured = Boolean(next.endpoint && next.region && next.bucket && next.accessKeyId && next.secretHint);
    this.backup = next;
    return null;
  }

  /** The Seafile part: any token of ten characters or more opens the library "Documents". */
  private updateDrive(patch: unknown): string | null {
    if (patch === null) {
      if (this.drive.provider === null) return null;
      this.drive = { ...this.drive, leaving: true };
      setTimeout(() => {
        this.driveFiles = 0;
        this.drive = { provider: null, url: '', folder: DRIVE_FOLDER_DEFAULT, library: null, tokenHint: null, leaving: false };
      }, 2_500);
      return null;
    }
    if (typeof patch !== 'object') return 'Requête invalide';
    const raw = patch as Record<string, unknown>;
    const token = typeof raw.token === 'string' ? raw.token.trim() : '';
    if (token && token.length < 10) return 'Jeton refusé par Seafile';
    if (!this.drive.tokenHint && !token) return 'Jeton refusé par Seafile';
    const url = typeof raw.url === 'string' ? raw.url.trim() : this.drive.url;
    if (!/^https?:\/\/./.test(url)) return 'Adresse Seafile invalide';
    this.drive = {
      provider: 'seafile',
      url,
      folder: typeof raw.folder === 'string' && raw.folder.trim() ? raw.folder.trim() : this.drive.folder,
      library: 'Documents',
      tokenHint: token ? hint(token) : this.drive.tokenHint,
      leaving: false,
    };
    this.drivePass();
    return null;
  }

  private drivePass(): void {
    if (this.driveRunning) return;
    this.driveRunning = true;
    setTimeout(() => {
      this.driveRunning = false;
      this.driveFiles = this.fileCount().files;
      this.driveLastPass = Date.now();
    }, 1_000);
  }

  private fileCount(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;
    for (const { record } of this.records.values()) {
      const fields = record.fields;
      const live = fields.deletedAt === null || fields.deletedAt === undefined;
      if (live && (record.type === 'attachment' || (record.type === 'block' && typeof fields.fileId === 'string'))) {
        files += 1;
        bytes += typeof fields.bytes === 'number' ? fields.bytes : 0;
      }
    }
    return { files, bytes };
  }

  private adminStatus(): AdminStatus {
    let notes = 0;
    let pages = 0;
    for (const { record } of this.records.values()) {
      if (record.fields.deletedAt !== null && record.fields.deletedAt !== undefined) continue;
      if (record.type === 'note' && record.fields.kind !== 'links') notes += 1;
      if (record.type === 'block' && record.fields.kind === 'page') pages += 1;
    }
    const { files, bytes } = this.fileCount();
    const interval = { off: 0, '6h': 6 * HOUR, daily: 24 * HOUR, weekly: 7 * 24 * HOUR }[this.backup.recurrence];
    const lastAt = this.lastRun?.finishedAt ?? null;
    return {
      server: { version: 'démo', notes, pages, files, fileBytes: bytes },
      backup: {
        running: this.backupRunning,
        last: this.lastRun,
        lastSuccessAt: this.lastRun?.ok ? lastAt : null,
        nextAt: this.backup.configured && interval > 0 ? (lastAt ?? Date.now()) + interval : null,
      },
      drive: {
        running: this.driveRunning,
        files: this.drive.provider ? this.driveFiles : 0,
        bytes: this.drive.provider ? bytes : 0,
        waiting: this.drive.leaving ? this.driveFiles : this.drive.provider && this.driveRunning ? Math.max(0, files - this.driveFiles) : 0,
        lastPassAt: this.driveLastPass,
        error: null,
      },
      restore: this.restore,
    };
  }

  /** `/api/admin…`: the status, the backups, a pass over the drive, a restore; downloads cannot leave the page. */
  private async admin(url: URL, method: string, init: RequestInit | undefined): Promise<Response> {
    await delay(120);
    if (url.pathname === '/api/admin' && method === 'GET') return jsonResponse(this.adminStatus());
    if (url.pathname === '/api/admin/backups') {
      if (!this.backup.configured) return jsonResponse({ error: 'Sauvegarde S3 non configurée' }, 409);
      if (method === 'GET') return jsonResponse({ snapshots: [...this.snapshots].sort((a, b) => b.at - a.at) });
      if (method === 'POST') {
        if (!this.backupRunning) {
          this.backupRunning = true;
          const startedAt = Date.now();
          setTimeout(() => {
            const at = Date.now();
            const snapshot = { name: snapshotName(at), at, bytes: 184_000 + Math.round(Math.random() * 4_000) };
            this.snapshots = [snapshot, ...this.snapshots].slice(0, this.backup.keep);
            this.lastRun = { startedAt, finishedAt: at, ok: true, error: null, snapshot: snapshot.name, bytes: snapshot.bytes, filesSent: 1, trigger: 'manual' };
            this.backupRunning = false;
          }, 1_500);
        }
        return jsonResponse(this.adminStatus(), 202);
      }
    }
    if (url.pathname === '/api/admin/drive/sync' && method === 'POST') {
      if (!this.drive.provider) return jsonResponse({ error: 'Seafile n’est pas relié' }, 409);
      this.drivePass();
      return jsonResponse(this.adminStatus(), 202);
    }
    if (url.pathname === '/api/admin/restore' && method === 'POST') {
      const mode = url.searchParams.get('mode') ?? 'merge';
      if (!isRestoreMode(mode)) return jsonResponse({ error: 'Mode de restauration inconnu' }, 400);
      if (this.restore.running) return jsonResponse({ error: 'Une restauration est déjà en cours' }, 409);
      const named = typeof init?.body === 'string' ? (JSON.parse(init.body) as { snapshot?: unknown }).snapshot : undefined;
      const source = typeof named === 'string' ? named : init?.body instanceof File ? init.body.name : 'archive.tar.gz';
      const startedAt = Date.now();
      this.restore = { running: true, startedAt, finishedAt: null, error: null, report: null };
      setTimeout(() => {
        this.restore = { running: false, startedAt, finishedAt: Date.now(), error: null, report: { mode, source, records: this.records.size, files: this.fileCount().files, missingFiles: 0, needDrive: 0 } };
      }, 1_000);
      return jsonResponse(this.adminStatus(), 202);
    }
    if (url.pathname === '/api/admin/downloads' && method === 'POST') return jsonResponse({ error: 'Téléchargement indisponible dans la démo' }, 501);
    return jsonResponse({ error: 'not found' }, 404);
  }

  /** `POST /api/sort`, after a pause; a review moves only what another collection takes and its own does not. */
  private async sort(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseSortRequest(body);
    if (!request) return json({ error: 'Requête de tri invalide' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(1_400);
    const current = request.targets.find(target => target.id === request.from);
    const moves: SortMove[] = [];
    for (const link of request.links) {
      if (current && fits(link, current)) continue;
      const target = request.targets.find(other => other.id !== request.from && fits(link, other));
      if (target) moves.push({ link: link.id, to: target.id });
    }
    return json({ moves });
  }

  /** `POST /api/coupons`, after a search's pause: two codes and a tip for the link's shop, in the language asked. */
  private async coupons(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseCouponRequest(body);
    if (!request) return json({ error: 'Demande de codes promo invalide' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(2_400);
    const english = request.lang === 'en';
    const shop = request.link.site || (english ? 'the shop' : 'la boutique');
    const code = foldText(shop).replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8) || 'BIENVENUE';
    const until = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    return json({
      coupons: [
        { code: `${code}15`, benefit: english ? '15% off your first order' : '15 % sur la première commande', conditions: english ? 'New customers' : 'Nouveaux clients', kind: 'percent', value: 15, minimum: null, expires: until, confirmed: true, source: 'Le Coin des Codes', sourceUrl: 'https://codes.example/' },
        { code: 'LIVRAISON', benefit: english ? 'Free delivery' : 'Livraison offerte', conditions: '', kind: 'shipping', value: null, minimum: 50, expires: null, confirmed: false, source: 'Réducs & Co', sourceUrl: null },
      ],
      tips: [{ text: english ? `10% off for signing up to ${shop}'s newsletter.` : `10 % de remise en s’inscrivant à la lettre de ${shop}.`, url: null }],
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/offers`, after a search's pause: three shops around the link's price, or second-hand listings under it. */
  private async offers(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseOfferRequest(body);
    if (!request) return json({ error: 'Demande d’offres invalide' }, 400);
    if (!this.settings.enabled) return json({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(2_200);
    const english = request.lang === 'en';
    const base = request.link.price ?? 120;
    const currency = request.link.currency ?? 'EUR';
    const round = (value: number): number => Math.round(value);
    if (request.market === 'new') {
      return json({
        offers: [
          { shop: 'Grand Bazar', title: '', price: round(base * 0.88), currency, shipping: 0, condition: 'new', details: english ? 'In stock' : 'En stock', url: 'https://grand-bazar.example/' },
          { shop: 'Le Comptoir des Objets', title: '', price: round(base * 0.95), currency, shipping: 4.9, condition: 'new', details: '', url: 'https://comptoir-objets.example/' },
          { shop: 'Maison Durable', title: '', price: base + 10, currency, shipping: 0, condition: 'new', details: english ? 'Ships in a week' : 'Expédié sous une semaine', url: null },
        ],
        range: null,
        note: '',
        searchedAt: Date.now(),
      });
    }
    return json({
      offers: [
        { shop: 'Le Grenier', title: english ? `${request.link.title}, size M` : `${request.link.title}, taille M`, price: round(base * 0.5), currency, shipping: 5.5, condition: 'used', details: english ? 'Very good condition' : 'Très bon état', url: 'https://le-grenier.example/' },
        { shop: 'Second Souffle', title: '', price: round(base * 0.62), currency, shipping: 0, condition: 'refurbished', details: english ? '12-month warranty' : 'Garantie 12 mois', url: 'https://second-souffle.example/' },
      ],
      range: { low: round(base * 0.45), high: round(base * 0.65), currency },
      note: '',
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/recipe`: the demo's tart, read from its page. */
  private async recipe(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseRecipeRequest(body);
    if (!request) return json({ error: 'Demande d’ingrédients invalide' }, 400);
    await delay(900);
    if (!/recette|recipe|tarte/.test(request.link.url)) return json({ error: 'Aucun ingrédient sur cette page' }, 502);
    return json({
      ingredients: ['1 pâte feuilletée', '4 pommes', '40 g de beurre', '3 cuillères à soupe de sucre', '1 sachet de sucre vanillé'],
      servings: '6 personnes',
      steps: [
        { section: '', text: 'Préchauffer le four à 200 °C.' },
        { section: '', text: 'Dérouler la pâte sur une plaque, la piquer à la fourchette et la laisser au frais 10 min.' },
        { section: 'Les pommes', text: 'Éplucher les pommes, les couper en lamelles fines et les disposer en rosace sur la pâte.' },
        { section: 'Les pommes', text: 'Parsemer de beurre en petits morceaux, de sucre et de sucre vanillé.' },
        { section: 'La cuisson', text: 'Enfourner 25 à 30 minutes, jusqu’à ce que les bords soient dorés.' },
        { section: 'La cuisson', text: 'Laisser tiédir 5 min avant de servir.' },
      ],
    });
  }

  /** `POST /api/ratings`, after a search's pause: the sites that rate the link's kind, a few made-up scores. */
  private async ratings(body: unknown): Promise<Response> {
    const request = parseRatingsRequest(body);
    if (!request) return jsonResponse({ error: 'Demande de notes invalide' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(2_000);
    const english = request.lang === 'en';
    const votes = (count: string): string => (english ? `${count} votes` : `${count.replace(',', ' ')} votes`);
    const sites: Record<string, readonly [string, string, number, number, string][]> = {
      film: [
        ['SensCritique', '', 7.4, 10, votes('8,200')],
        ['IMDb', '', 7.6, 10, votes('41,000')],
        ['Rotten Tomatoes', english ? 'Critics' : 'Critiques', 88, 100, english ? '96 reviews' : '96 critiques'],
        ['Rotten Tomatoes', english ? 'Audience' : 'Public', 81, 100, ''],
      ],
      book: [
        ['SensCritique', '', 7.8, 10, votes('3,100')],
        ['Babelio', '', 4.1, 5, english ? '2,400 reviews' : '2 400 critiques'],
        ['Goodreads', '', 4.2, 5, votes('58,000')],
      ],
      game: [
        ['SensCritique', '', 8.1, 10, votes('5,600')],
        ['Metacritic', 'Metascore', 89, 100, english ? '112 reviews' : '112 critiques'],
        ['OpenCritic', '', 90, 100, ''],
      ],
      music: [
        ['SensCritique', '', 7.2, 10, votes('1,900')],
        ['Metacritic', 'Metascore', 82, 100, english ? '21 reviews' : '21 critiques'],
      ],
    };
    const kind = request.link.kind === 'series' ? 'film' : request.link.kind;
    const found = sites[kind] ?? sites.film!;
    const slug = foldText(request.link.title).replace(/[^a-z0-9]+/g, '-');
    return jsonResponse({
      work: `${request.link.title} (2025)`,
      ratings: found.map(([source, label, value, scale, count]) => ({ source, label, value, scale, count, url: `https://${foldText(source).replace(/[^a-z]/g, '')}.example/${slug}` })),
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/recap`, after a search's pause: the demo's polar up to the episode asked. */
  private async recap(body: unknown): Promise<Response> {
    const request = parseRecapRequest(body);
    if (!request) return jsonResponse({ error: 'Demande de résumé invalide' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(2_600);
    const english = request.lang === 'en';
    const { season, episode } = request;
    const before = english
      ? 'Season 1. At the Arctic research base, the death of a glaciologist looks like an accident. Inspector Hanna Lind is flown in, and finds the base hiding a lost drilling sample.'
      : 'Saison 1. Sur la base scientifique de l’Arctique, la mort d’une glaciologue a tout d’un accident. L’inspectrice Hanna Lind arrive par le dernier avion, et découvre que la base cache un carottage disparu.';
    const now = english
      ? `Season ${season}${episode ? `, up to episode ${episode}` : ''}. The polar night has set in and the base is cut off. Hanna suspects the station's director, whose alibi no longer holds, while the supply ship turns back in the storm.`
      : `Saison ${season}${episode ? `, jusqu’à l’épisode ${episode}` : ''}. La nuit polaire est tombée et la base est coupée du monde. Hanna soupçonne le directeur de la station, dont l’alibi ne tient plus, tandis que le navire de ravitaillement fait demi-tour dans la tempête.`;
    return jsonResponse({
      recap: season > 1 ? `${before}\n\n${now}` : now,
      characters: [
        { name: 'Hanna Lind', note: english ? 'The inspector, alone against everyone at the base.' : 'L’inspectrice, seule contre toute la base.' },
        { name: 'Erik Dahl', note: english ? 'The director, whose alibi has just fallen apart.' : 'Le directeur, dont l’alibi vient de tomber.' },
        { name: 'Mia Sund', note: english ? 'The radio operator, Hanna’s only ally.' : 'L’opératrice radio, seule alliée d’Hanna.' },
      ],
      stop: english ? `End of season ${season}${episode ? `, episode ${episode}` : ''}.` : episode ? `Fin de l’épisode ${episode} de la saison ${season}.` : `Fin de la saison ${season}.`,
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/coverage`, after a search's pause: three outlets on the story, each with its angle. */
  private async coverage(body: unknown): Promise<Response> {
    const request = parseCoverageRequest(body);
    if (!request) return jsonResponse({ error: 'Demande d’autres regards invalide' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(2_400);
    const english = request.lang === 'en';
    const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
    return jsonResponse({
      story: english ? 'Ten years on, more and more towns are slowing their streets down.' : 'Dix ans après les premières, de plus en plus de villes ralentissent leurs rues.',
      outlets: [
        { outlet: 'Le Quotidien du Matin', title: 'Villes à 30 : le bilan chiffré', url: 'https://quotidien-du-matin.example/villes-30', date: day(3), angle: english ? 'The figures' : 'Les chiffres', adds: english ? 'Serious accidents down by a third in the towns studied.' : 'Les accidents graves ont baissé d’un tiers dans les villes étudiées.' },
        { outlet: 'Auto Magazine', title: 'Le 30 km/h, une fausse bonne idée ?', url: 'https://auto-magazine.example/30-kmh', date: day(5), angle: english ? 'The drivers’ side' : 'Du côté des automobilistes', adds: english ? 'Says journeys got longer, which the saved article disputes.' : 'Parle de trajets rallongés, ce que l’article enregistré conteste.' },
        { outlet: 'City Lab Weekly', title: 'What French towns learned from slowing down', url: 'https://citylab-weekly.example/slow-towns', date: day(8), angle: english ? 'Seen from abroad' : 'Vu de l’étranger', adds: '' },
      ],
      note: english ? 'They agree on the fall in accidents; they differ on journey times.' : 'Tous s’accordent sur la baisse des accidents ; ils divergent sur les temps de trajet.',
      searchedAt: Date.now(),
    });
  }

  /** `POST /api/ask`, after a pause: an answer that says what it was asked, and a source when it may search. */
  private async ask(body: unknown): Promise<Response> {
    const request = parseAskRequest(body);
    if (!request) return jsonResponse({ error: 'Question invalide' }, 400);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' }, 409);
    await delay(request.web ? 2_400 : 1_400);
    const english = request.lang === 'en';
    const about = request.link.title || request.link.url;
    return jsonResponse({
      answer: english
        ? `This is a demo, so here is a made-up answer about « ${about} ».\n\nOn a real server, Claude reads the page and answers « ${request.question} » from it${request.web ? ', and from the web' : ''}.`
        : `Ceci est une démo : voici une réponse inventée sur « ${about} ».\n\nSur un vrai serveur, Claude lit la page et répond à « ${request.question} » d’après elle${request.web ? ', et d’après le web' : ''}.`,
      sources: request.web ? [{ title: english ? 'A page found on the web' : 'Une page trouvée sur le web', url: 'https://source.example/' }] : [],
    });
  }

  /** `POST /api/pages/ask`, after a pause: a made-up answer citing the first words of the pages, so citations can be tried. */
  private async askPages(body: unknown): Promise<Response> {
    const request = parsePagesAskRequest(body);
    if (!request) return jsonResponse({ error: 'Question invalide' }, 400);
    if (!this.pages.enabled) return jsonResponse({ error: 'Les questions sur les pages sont désactivées dans l’administration' }, 409);
    if (request.scope === 'all' && !this.pages.everywhere) return jsonResponse({ error: 'Les questions sur toutes les pages sont désactivées dans l’administration' }, 409);
    if (requestChars(request.pages) > PAGES_REACH_CHARS[this.pages.reach]) return jsonResponse({ error: 'Ces pages sont trop longues pour une question : choisissez moins de pages' }, 409);
    if (!this.settings.enabled) return jsonResponse({ error: 'Claude n’a pas de clé : ajoutez-en une dans l’administration.' }, 409);
    const web = request.web && this.pages.web;
    await delay(web ? 2_400 : 1_400);
    const english = request.lang === 'en';
    const cited = request.pages.flatMap(page => page.blocks.slice(0, 1).map(block => ({ page, block }))).slice(0, 2);
    const answer: PagesAskResponse = {
      parts: [
        {
          text: english
            ? `This is a demo, so here is a made-up answer to « ${request.question} ». On a real server, Claude reads ${request.pages.length === 1 ? 'the page' : `these ${request.pages.length} pages`}${web ? ' and the web' : ''} and cites what it rests on`
            : `Ceci est une démo : voici une réponse inventée à « ${request.question} ». Sur un vrai serveur, Claude lit ${request.pages.length === 1 ? 'la page' : `ces ${request.pages.length} pages`}${web ? ' et le web' : ''} et cite ce sur quoi il s’appuie`,
          cites: [],
        },
        ...cited.map(({ page }, at) => ({ text: english ? `${at === 0 ? ', such as the start of' : ' and of'} « ${page.path} »` : `${at === 0 ? ', comme le début de' : ' et de'} « ${page.path} »`, cites: [at] })),
        { text: '.', cites: [] },
      ],
      citations: cited.map(({ page, block }) => ({ pageId: page.id, blockIds: [block.id], quote: block.text.slice(0, 200) })),
      sources: web ? [{ title: english ? 'A page found on the web' : 'Une page trouvée sur le web', url: 'https://source.example/' }] : [],
    };
    return jsonResponse(answer);
  }

  /** `POST /api/seerr`: the demo's Seerr has the September film, nothing else yet. */
  private async seerrLookup(body: unknown): Promise<Response> {
    const request = parseSeerrRequest(body);
    if (!request) return jsonResponse({ error: 'Demande Seerr invalide' }, 400);
    if (!this.seerr.url) return jsonResponse({ error: 'Seerr n’est pas relié : ajoutez-le dans l’administration.' }, 409);
    await delay(500);
    const { link } = request;
    if (!this.seerr.keyHint) return jsonResponse({ url: seerrSearchUrl(this.seerr.url, link) ?? this.seerr.url, status: null, title: '' });
    const there = /septembre/i.test(link.title);
    return jsonResponse({ url: seerrPageUrl(this.seerr.url, link.kind === 'series' ? 'tv' : 'movie', there ? 81_312 : 92_407), status: there ? 'available' : link.kind === 'series' ? 'partial' : 'missing', title: `${link.title} (2025)` });
  }

  /** `POST /api/copies`: an article as a few blocks and its picture, as the server would read it. */
  private async copy(body: unknown): Promise<Response> {
    const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    const request = parseCopyRequest(body);
    if (!request) return json({ error: 'Demande de copie invalide' }, 400);
    await delay(1_200);
    const link = [...this.records.values()].map(stored => stored.record).find(record => record.type === 'link' && record.id === request.link.id);
    const title = typeof link?.fields.title === 'string' && link.fields.title ? link.fields.title : 'Article';
    return json({
      title,
      site: typeof link?.fields.siteName === 'string' ? link.fields.siteName : '',
      byline: 'Claire Martin',
      published: '2026-10-14',
      drafts: [
        { kind: 'text', text: 'Il y a dix ans, ralentir une ville passait pour une lubie. Aujourd’hui, des dizaines de communes ont fait le pas, et les chiffres commencent à parler.' },
        { kind: 'image', text: '', extra: { fileId: 'demo-article', fileName: 'demo-article.webp', mime: 'image/webp', bytes: 48_000, width: 1200, height: 800, uploaded: true } },
        { kind: 'h2', text: 'Ce qui a changé' },
        { kind: 'text', text: 'Moins de bruit, moins d’accidents graves, et des rues où {b:les enfants vont seuls à l’école}.' },
        { kind: 'bullet', text: 'Zones à 30 km/h généralisées' },
        { kind: 'bullet', text: 'Rues scolaires fermées aux voitures aux heures d’entrée' },
        { kind: 'callout', text: '{i:« On a gagné du calme sans perdre de temps. »}' },
      ],
    });
  }

  /** Answers `fetch` for the demo address; anything else goes to the network. */
  async handle(url: URL, init: RequestInit | undefined): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (value: unknown): Response => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/api/health') return json({ ok: true, version: 'démo', apiVersion: 1, analysis: this.settings.enabled });
    if (url.pathname === '/api/settings') {
      if (method === 'PUT') return this.updateSettings(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      await delay(80);
      return json(this.settingsView());
    }
    if (url.pathname.startsWith('/api/admin')) return this.admin(url, method, init);
    if (url.pathname === '/api/usage') {
      return json({
        monthToDate: { analyses: 37, inputTokens: 0, outputTokens: 0, costUsd: 1.42 },
        total: { analyses: 212, inputTokens: 0, outputTokens: 0, costUsd: 8.37 },
        model: this.settings.model,
        budgetUsd: this.settings.budgetUsd,
      });
    }
    if (url.pathname === '/api/sync' && method === 'POST') {
      return json(await this.exchange(JSON.parse(String(init?.body ?? '{}')), init?.signal ?? undefined));
    }
    if (url.pathname === '/api/sort' && method === 'POST') return this.sort(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/coupons' && method === 'POST') return this.coupons(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/offers' && method === 'POST') return this.offers(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/recipe' && method === 'POST') return this.recipe(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/copies' && method === 'POST') return this.copy(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/ratings' && method === 'POST') return this.ratings(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/recap' && method === 'POST') return this.recap(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/coverage' && method === 'POST') return this.coverage(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/ask' && method === 'POST') return this.ask(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/pages/ask' && method === 'POST') return this.askPages(JSON.parse(String(init?.body ?? '{}')));
    if (url.pathname === '/api/seerr' && method === 'POST') return this.seerrLookup(JSON.parse(String(init?.body ?? '{}')));
    const blob = /^\/api\/(blobs|files)\/([^/]+)$/.exec(url.pathname);
    if (blob) {
      const id = decodeURIComponent(blob[2]!);
      if (method === 'PUT') {
        const file = init?.body instanceof FormData ? init.body.get('file') : null;
        if (file instanceof Blob) this.uploads.set(id, file);
        await delay(300);
        return json({ id, mime: file instanceof Blob ? file.type : 'application/octet-stream', width: 0, height: 0, bytes: file instanceof Blob ? file.size : 0 });
      }
      if (blob[1] === 'files') return new Response('not found', { status: 404 });
      await delay(60 + Math.random() * 140);
      const image = this.uploads.get(id) ?? demoImage(id);
      return image ? new Response(image, { headers: { 'Content-Type': image.type } }) : new Response('not found', { status: 404 });
    }
    return new Response('not found', { status: 404 });
  }
}
