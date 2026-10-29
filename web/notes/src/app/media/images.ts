/**
 * Images, as object URLs.
 *
 * The server wants the bearer token on every request, so an image cannot be a
 * plain `<img src>`: it is fetched as bytes and shown through an object URL.
 * This module keeps those URLs: one per (blob, variant), shared by every
 * component showing it, loaded at most four at a time so a wall of thumbnails
 * does not stampede the server, and revoked only once nothing shows it and it
 * has fallen out of a small recently-used set.
 *
 * A photo added in this browser is shown from IndexedDB (`files`) until it is
 * uploaded, so it is there at once and offline. The browser's HTTP cache keeps
 * the server's copies (they are immutable), so a reload costs no bandwidth.
 */
import { useCallback, useSyncExternalStore } from 'react';

import { useSettingsStore } from '../store/settings';
import { downloadBlob } from '../sync/transport';
import { readStoredFile } from './files';

export type Variant = 'display' | 'original';
/** `waiting`: not in this browser, and not on the server yet (another device's photo still uploading). */
type Status = 'idle' | 'loading' | 'ready' | 'failed' | 'waiting';

interface Entry {
  url: string | null;
  status: Status;
  refs: number;
  failedAt: number;
  readonly listeners: Set<() => void>;
}

/** Where bytes come from when they are not in this browser. Swapped by the dev demo. */
export type BlobSource = (id: string, variant: Variant) => Promise<Blob | null>;

const MAX_PARKED = 160;
const MAX_CONCURRENT = 4;
const RETRY_AFTER_MS = 30_000;

const entries = new Map<string, Entry>();
/** Unreferenced entries, oldest first: revoked past `MAX_PARKED`. */
const parked = new Set<string>();
const queue: (() => Promise<void>)[] = [];
let active = 0;

const serverSource: BlobSource = async (id, variant) => {
  const server = useSettingsStore.getState().server;
  if (!server) return null;
  return downloadBlob(server, id, variant);
};

let source: BlobSource = serverSource;

export function setBlobSource(next: BlobSource | null): void {
  source = next ?? serverSource;
}

const keyOf = (id: string, variant: Variant): string => `${variant}:${id}`;

function entryFor(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { url: null, status: 'idle', refs: 0, failedAt: 0, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function emit(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    active += 1;
    void job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

function load(key: string, id: string, variant: Variant, onServer: boolean): void {
  const entry = entryFor(key);
  entry.status = 'loading';
  queue.push(async () => {
    const local = await readStoredFile(id).catch(() => null);
    const blob = local ?? (onServer ? await source(id, variant).catch(() => null) : null);
    const current = entries.get(key);
    if (current !== entry) return;
    if (blob) {
      entry.url = URL.createObjectURL(blob);
      entry.status = 'ready';
    } else if (!onServer) {
      entry.status = 'waiting';
    } else {
      entry.status = 'failed';
      entry.failedAt = Date.now();
    }
    emit(entry);
  });
  pump();
}

function evict(): void {
  while (parked.size > MAX_PARKED) {
    const oldest = parked.values().next().value as string;
    parked.delete(oldest);
    const entry = entries.get(oldest);
    if (!entry || entry.refs > 0) continue;
    if (entry.url) URL.revokeObjectURL(entry.url);
    entries.delete(oldest);
  }
}

function acquire(id: string, variant: Variant, onServer: boolean, listener: () => void): () => void {
  const key = keyOf(id, variant);
  const entry = entryFor(key);
  entry.refs += 1;
  entry.listeners.add(listener);
  parked.delete(key);
  const retry = entry.status === 'failed' && Date.now() - entry.failedAt > RETRY_AFTER_MS;
  if (entry.status === 'idle' || retry || (entry.status === 'waiting' && onServer)) load(key, id, variant, onServer);
  return () => {
    entry.refs -= 1;
    entry.listeners.delete(listener);
    if (entry.refs <= 0) {
      parked.add(key);
      evict();
    }
  };
}

/** Show bytes this browser already holds (a photo just added) without a round trip. */
export function primeBlobUrl(id: string, blob: Blob): void {
  for (const variant of ['display', 'original'] as const) {
    const entry = entryFor(keyOf(id, variant));
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = URL.createObjectURL(blob);
    entry.status = 'ready';
    emit(entry);
  }
}

/** Forget failures, so images retry at once (a new server address or token). */
export function retryFailedImages(): void {
  for (const [key, entry] of entries) {
    if (entry.status !== 'failed') continue;
    entry.status = 'idle';
    if (entry.refs > 0) {
      const [variant, ...rest] = key.split(':');
      load(key, rest.join(':'), variant as Variant, true);
    }
  }
}

/**
 * The object URL for a blob, or null while it loads (or when it cannot).
 * `onServer` false (a photo whose upload has not landed) shows this browser's
 * own copy if it has one, and loads from the server once it flips to true.
 */
export function useBlobUrl(id: string | null | undefined, variant: Variant = 'display', onServer = true): string | null {
  const subscribe = useCallback(
    (listener: () => void) => (id ? acquire(id, variant, onServer, listener) : () => {}),
    [id, variant, onServer],
  );
  const snapshot = useCallback(() => (id ? (entries.get(keyOf(id, variant))?.url ?? null) : null), [id, variant]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Test seam. */
export function resetImages(): void {
  for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  entries.clear();
  parked.clear();
  queue.length = 0;
  active = 0;
  source = serverSource;
}
