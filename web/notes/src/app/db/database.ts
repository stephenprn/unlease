/**
 * IndexedDB: the web app's disk.
 *
 * Three object stores:
 *  - `records`: every synced record as a document (its fields and their
 *    clocks) plus a `pending` mark, the same shape the phone keeps in SQLite;
 *  - `meta`: the sync cursor and this browser's clock node id. They live here
 *    rather than in localStorage because they only mean something next to these
 *    records: clearing one without the other would skip or replay pages;
 *  - `files`: photos added on this device, kept until the server has them.
 *
 * The library holds everything in memory and treats this as write-behind
 * storage: one read at boot, then writes coalesced per record and committed in
 * one transaction per tick (`Persister`).
 */
import type { Clocks, Fields, SyncRecord } from '@unlease/core/sync/record';

export const DB_VERSION = 1;

export interface StoredRow {
  /** `type:id`, the same key the library uses in memory. */
  readonly key: string;
  /** One of the types the app syncs (`@unlease/notes/sync/types`). */
  readonly type: string;
  readonly id: string;
  readonly fields: Fields;
  readonly clocks: Clocks;
  readonly pending: 0 | 1;
  /** Where its unacknowledged typed text started from (`core/sync/bases`); absent when none. */
  readonly bases?: { readonly fields: Fields; readonly clocks: Clocks };
}

/** A photo waiting for (or kept after) its upload. Bytes, not a Blob: every engine clones an ArrayBuffer. */
export interface StoredFile {
  readonly id: string;
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly createdAt: number;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    open.onsuccess = () => {
      const db = open.result;
      // Another tab is upgrading the schema: step aside rather than block it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
  });
}

export function rowFor(record: SyncRecord, pending: boolean, base?: SyncRecord): StoredRow {
  return {
    key: `${record.type}:${record.id}`,
    type: record.type,
    id: record.id,
    fields: record.fields,
    clocks: record.clocks,
    pending: pending ? 1 : 0,
    ...(base ? { bases: { fields: base.fields, clocks: base.clocks } } : {}),
  };
}

export function recordOf(row: StoredRow): SyncRecord {
  return { type: row.type, id: row.id, fields: row.fields, clocks: row.clocks };
}

export function baseOf(row: StoredRow): SyncRecord | undefined {
  return row.bases ? { type: row.type, id: row.id, fields: row.bases.fields, clocks: row.bases.clocks } : undefined;
}

export async function readEverything(db: IDBDatabase): Promise<{ rows: StoredRow[]; meta: Map<string, string> }> {
  const tx = db.transaction(['records', 'meta'], 'readonly');
  const [rows, meta] = await Promise.all([
    request(tx.objectStore('records').getAll() as IDBRequest<StoredRow[]>),
    request(tx.objectStore('meta').getAll() as IDBRequest<{ key: string; value: string }[]>),
  ]);
  return { rows, meta: new Map(meta.map(entry => [entry.key, entry.value])) };
}

export function writeRows(db: IDBDatabase, rows: readonly StoredRow[], meta: readonly (readonly [string, string])[]): Promise<void> {
  const tx = db.transaction(['records', 'meta'], 'readwrite');
  const store = tx.objectStore('records');
  for (const row of rows) store.put(row);
  const metaStore = tx.objectStore('meta');
  for (const [key, value] of meta) metaStore.put({ key, value });
  return finished(tx);
}

export async function saveFile(db: IDBDatabase, file: StoredFile): Promise<void> {
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').put(file);
  await finished(tx);
}

export async function readFile(db: IDBDatabase, id: string): Promise<StoredFile | null> {
  const tx = db.transaction('files', 'readonly');
  return ((await request(tx.objectStore('files').get(id))) as StoredFile | undefined) ?? null;
}

export async function deleteFile(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').delete(id);
  await finished(tx);
}

export async function listFileIds(db: IDBDatabase): Promise<string[]> {
  const tx = db.transaction('files', 'readonly');
  return ((await request(tx.objectStore('files').getAllKeys())) as IDBValidKey[]).map(String);
}

/**
 * Write-behind: callers mark what changed, and the newest in-memory state of
 * each marked record is written once, in order, a tick later. A burst of
 * writes to one record (typing) is one put, and a crash can only lose the last
 * tick, never reorder two writes.
 */
export class Persister {
  private readonly dirty = new Set<string>();
  private readonly meta = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: IDBDatabase,
    private readonly snapshot: (key: string) => StoredRow | null,
    private readonly onError: (error: unknown) => void,
  ) {}

  mark(key: string): void {
    this.dirty.add(key);
    this.schedule();
  }

  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 0);
  }

  /** Commit everything marked so far; resolves when it is on disk. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.dirty.size === 0 && this.meta.size === 0) return this.chain;
    const rows: StoredRow[] = [];
    for (const key of this.dirty) {
      const row = this.snapshot(key);
      if (row) rows.push(row);
    }
    const meta = [...this.meta.entries()];
    const keys = [...this.dirty];
    this.dirty.clear();
    this.meta.clear();
    this.chain = this.chain
      .then(() => writeRows(this.db, rows, meta))
      .catch(error => {
        // Nothing marked is dropped: the next flush writes these again (newest state, unless newer metadata came since).
        for (const key of keys) this.dirty.add(key);
        for (const [key, value] of meta) if (!this.meta.has(key)) this.meta.set(key, value);
        this.retry();
        this.onError(error);
      });
    return this.chain;
  }

  private retry(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 5_000);
  }
}
