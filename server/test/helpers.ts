import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import sharp from 'sharp';
import { formatHlc } from '@unlease/core/sync/hlc';
import type { Fields, SyncRecord } from '@unlease/core/sync/record';
import { type RecordType } from '@unlease/notes/sync/types';
import { LinkAnalyzer } from '../src/apps/notes/analysis/analyzer';
import type { Fetcher, FetchOptions, FetchResult } from '../src/apps/notes/analysis/fetcher';
import type { MessagesApi } from '../src/apps/notes/analysis/model';
import { pendingIn } from '../src/apps/notes/analysis/pending';
import { LinkModelProvider } from '../src/apps/notes/analysis/provider';
import { AnalysisQueue } from '../src/apps/notes/analysis/queue';
import type { UsageStore } from '../src/apps/notes/analysis/usage';
import { createNotesApp, NOTES_PUSH_RULES, type NotesApp } from '../src/apps/notes';
import type { ServerApp } from '../src/apps/types';
import { Administration } from '../src/admin';
import { createApp } from '../src/app';
import { RestoreService } from '../src/backup/restore';
import { BackupService } from '../src/backup/service';
import { BlobStore } from '../src/blobs/store';
import { openDatabase, type Database } from '../src/db/database';
import { DriveSync } from '../src/drive/sync';
import { SettingsStore } from '../src/settings/store';
import { checkS3Bucket, checkSeafile, checkSeerrServer, type ListModels } from '../src/settings/update';
import { ServerClock } from '../src/sync/clock';
import { ChangeNotifier } from '../src/sync/notifier';
import { RecordStore } from '../src/sync/records';
import { SyncService } from '../src/sync/service';
import { FakeS3, FakeSeafile } from './fakes';

export const TOKEN = 'test-token-4f1c2a9b7e';
/** The ANTHROPIC_API_KEY fallback test servers start with, unless told otherwise. */
export const ENV_KEY = 'sk-ant-env-key-0001';
export const AUTH = { Authorization: `Bearer ${TOKEN}` };
/** 18 October 2026, noon UTC. */
export const T0 = Date.UTC(2026, 9, 18, 12);

export function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

export interface TestServer {
  readonly dir: string;
  readonly db: Database;
  readonly records: RecordStore;
  readonly notifier: ChangeNotifier;
  readonly sync: SyncService;
  readonly blobs: BlobStore;
  readonly usage: UsageStore;
  readonly settings: SettingsStore;
  /** Carnet's part of the server, and the apps this test server runs (Carnet alone). */
  readonly notes: NotesApp;
  readonly apps: readonly ServerApp[];
  /** What `POST /api/sort` and the link modules ask. */
  readonly claude: FakeClaude;
  /** The pages the recipe and copy modules read. */
  readonly fetcher: Fetcher;
  /** The bucket backups go to, and the Seafile library files go to. */
  readonly s3: FakeS3;
  readonly seafile: FakeSeafile;
  readonly drive: DriveSync;
  readonly backups: BackupService;
  readonly restore: RestoreService;
  readonly admin: Administration;
  readonly app: ReturnType<typeof createApp>;
  readonly time: { value: number };
  readonly now: () => number;
  close(): void;
}

export interface TestServerOptions {
  readonly corsOrigins?: string[];
  /** ANTHROPIC_API_KEY; null for a server started without one. */
  readonly envApiKey?: string | null;
  readonly listModels?: ListModels;
  /** A web app build to serve beside the API. */
  readonly webDir?: string;
  /** The pages the recipe and copy modules read (none by default). */
  readonly fetcher?: Fetcher;
  /** Seerr as the server reaches it (unreachable by default). */
  readonly seerrFetch?: typeof fetch;
}

export function createTestServer(options: TestServerOptions = {}): TestServer {
  const dir = mkdtempSync(join(tmpdir(), 'carnet-test-'));
  const time = { value: T0 };
  const now = () => time.value;
  const db = openDatabase(join(dir, 'carnet.sqlite'));
  const records = new RecordStore(db);
  const notifier = new ChangeNotifier();
  const sync = new SyncService({ db, records, clock: new ServerClock('srvtest01', now), notifier, rules: NOTES_PUSH_RULES, now });
  const blobs = new BlobStore(db, join(dir, 'blobs'), now);
  const settings = new SettingsStore(db, {
    apiKey: options.envApiKey === undefined ? ENV_KEY : options.envApiKey,
    model: 'claude-opus-5-5',
    budgetUsd: 15,
  });
  const claude = new FakeClaude();
  const fetcher = options.fetcher ?? new FakeFetcher({});
  const seerrFetch: typeof fetch = options.seerrFetch ?? (() => Promise.reject(new TypeError('fetch failed')));
  const provider = new LinkModelProvider(settings, { effort: 'low', createApi: () => claude, sleep: async () => {} });
  const s3 = new FakeS3('carnet-test', now);
  const seafile = new FakeSeafile();
  const tmpDir = join(dir, 'tmp');
  mkdirSync(tmpDir, { recursive: true });
  // Carnet, as main.ts makes it, with Claude, the pages it reads and Seerr stood in for; its link reading is `analysisOf`'s.
  const notes = createNotesApp({ db, sync, records, blobs, settings, claudeEffort: 'low', analysisConcurrency: 2, provider, fetcher, seerrFetch, now });
  const apps = [notes];
  const usage = notes.usage;
  const drive = new DriveSync({ db, records, blobs, settings, apps, fetcher: seafile.fetch, now });
  blobs.useRemote(drive);
  const backups = new BackupService({ db, records, blobs, settings, sync, tmpDir, version: 'test', fetcher: s3.fetch, s3RetryDelaysMs: [], drive, apps, now });
  const restore = new RestoreService({ sync, records, blobs, settings, tmpDir, fetcher: s3.fetch, s3RetryDelaysMs: [], drive, now, onFiles: () => drive.kick(), exclusive: work => backups.exclusive(work) });
  const admin = new Administration({ db, blobs, backups, drive, restore, tmpDir, version: 'test', now });
  const app = createApp({
    config: { token: TOKEN, corsOrigins: options.corsOrigins ?? ['https://carnet.example.fr'], webDir: options.webDir ?? null },
    sync,
    blobs,
    settings,
    apps,
    listModels: options.listModels ?? (async () => ({ data: [] })),
    checks: { checkS3: config => checkS3Bucket(config, s3.fetch), checkDrive: target => checkSeafile(target, seafile.fetch), checkSeerr: config => checkSeerrServer(config, seerrFetch) },
    admin,
    now,
  });
  return {
    dir,
    db,
    records,
    notifier,
    sync,
    blobs,
    usage,
    settings,
    notes,
    apps,
    claude,
    fetcher,
    s3,
    seafile,
    drive,
    backups,
    restore,
    admin,
    app,
    time,
    now,
    close() {
      drive.stop();
      backups.stop();
      notifier.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A record as a device would push it: every field written at one clock. */
export function rec(type: RecordType, id: string, fields: Fields, wall: number, node = 'phone1', counter = 0): SyncRecord {
  const clock = formatHlc(wall, counter, node);
  return { type, id, fields, clocks: Object.fromEntries(Object.keys(fields).map(field => [field, clock])) };
}

export async function postSync(server: TestServer, body: unknown, headers: Record<string, string> = {}) {
  const response = await server.app.request('/api/sync', {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

export function listNote(id: string, title: string, wall: number, extra: Fields = {}): SyncRecord {
  return rec('note', id, { kind: 'links', title, hint: '', position: 'a0', trashedAt: null, deletedAt: null, createdAt: wall, ...extra }, wall);
}

export function pendingLink(id: string, url: string, wall: number, extra: Fields = {}): SyncRecord {
  return rec(
    'link',
    id,
    { noteId: 'inbox', url, status: 'pending', autoFile: false, title: '', kind: 'other', analyzedAt: null, createdAt: wall, deletedAt: null, ...extra },
    wall,
  );
}

export async function jpeg(width: number, height: number, color = { r: 180, g: 60, b: 40 }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

export interface FakeRoute {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer;
  /** Where redirects ended. */
  readonly url?: string;
  readonly error?: Error;
}

/** Answers from a table of URLs, recording who asked with which user agent. */
export class FakeFetcher implements Fetcher {
  readonly calls: { url: string; userAgent: string | undefined; referer: string | undefined }[] = [];

  constructor(private readonly routes: Record<string, FakeRoute | ((userAgent: string | undefined) => FakeRoute)>) {}

  async fetch(url: string, options: FetchOptions): Promise<FetchResult> {
    const userAgent = options.headers?.['user-agent'];
    this.calls.push({ url, userAgent, referer: options.headers?.referer });
    const entry = this.routes[url];
    const route = typeof entry === 'function' ? entry(userAgent) : (entry ?? { status: 404, headers: { 'content-type': 'text/html' }, body: '<title>Not found</title>' });
    if (route.error) throw route.error;
    const body = typeof route.body === 'string' ? Buffer.from(route.body) : (route.body ?? Buffer.alloc(0));
    const type = route.headers?.['content-type'] ?? '';
    const limit = typeof options.maxBytes === 'function' ? options.maxBytes(type) : options.maxBytes;
    return { url: route.url ?? url, status: route.status ?? 200, headers: route.headers ?? {}, body: body.subarray(0, limit), truncated: body.length > limit };
  }

  urls(): string[] {
    return this.calls.map(call => call.url);
  }
}

type Reply = BetaMessage | Error | ((params: MessageCreateParamsNonStreaming) => BetaMessage);

/** Stands in for `client.beta.messages`: replies in order, keeps every request. */
export class FakeClaude implements MessagesApi {
  readonly requests: MessageCreateParamsNonStreaming[] = [];
  private readonly replies: Reply[] = [];

  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  async create(params: MessageCreateParamsNonStreaming): Promise<BetaMessage> {
    this.requests.push(params);
    const next = this.replies.shift();
    if (!next) throw new Error('FakeClaude: no reply queued');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(params) : next;
  }

  /** The user message text of request `index`. */
  userText(index = 0): string {
    const content = this.requests[index]!.messages[0]!.content;
    if (typeof content === 'string') return content;
    return content.map(block => (block.type === 'text' ? block.text : '')).join('');
  }
}

export function claudeMessage(output: unknown, overrides: Record<string, unknown> = {}): BetaMessage {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output), citations: null },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    diagnostics: null,
    usage: {
      input_tokens: 3000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1500,
      cache_creation: null,
      fallback_credit: null,
      inference_geo: null,
      iterations: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard',
      speed: null,
    },
    ...overrides,
  } as unknown as BetaMessage;
}

const wired = new WeakMap<TestServer, () => void>();

/** The analysis queue wired as in main.ts, with Claude replaced by `claude`; the budget is set as the apps would. */
export function analysisOf(server: TestServer, options: { fetcher: Fetcher; claude?: FakeClaude; budget?: number }) {
  if (options.budget !== undefined) server.settings.update({ budgetUsd: options.budget });
  const claude = options.claude ?? new FakeClaude();
  const provider = new LinkModelProvider(server.settings, { effort: 'low', createApi: () => claude, sleep: async () => {} });
  let queue: AnalysisQueue | null = null;
  const analyzer = new LinkAnalyzer({
    sync: server.sync,
    records: server.records,
    blobs: server.blobs,
    usage: server.usage,
    fetcher: options.fetcher,
    analysis: () => provider.current(),
    now: server.now,
    requeue: id => queue?.enqueue([id]),
  });
  queue = new AnalysisQueue((id, signal) => analyzer.analyze(id, signal), 2);
  // The latest wiring replaces the one before, as main.ts makes only one.
  wired.get(server)?.();
  wired.set(
    server,
    server.sync.onStored(stored => {
      const ids = pendingIn(stored);
      if (ids.length > 0) queue?.enqueue(ids);
    }),
  );
  return { analyzer, queue };
}

export function linkFields(server: TestServer, id: string): Fields {
  return server.records.get('link', id)!.fields;
}
