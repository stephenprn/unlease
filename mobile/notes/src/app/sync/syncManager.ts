/**
 * The foreground sync loop: always either a push or a long-poll the server holds open.
 * A local write aborts the long-poll and pushes (debounced); a refused token stops the loop.
 * Going to the background ends the loop, but what was just written still goes out.
 */
import { t } from '@unlease/core/i18n';
import { syncOnce, type SyncStore } from '@unlease/core/sync/engine';
import type { ServerMark } from '@unlease/core/sync/protocol';
import { countPending, pendingRecords } from '@data/repositories/recordRepository';
import { readSyncState, writeSyncState } from '@data/repositories/stateRepository';
import { loadLocalFiles, markAllFilesPending, markFileUploaded } from '@data/repositories/fileRepository';
import { onOnline } from '@platform/connectivity';

import {
  acknowledge,
  basesFor,
  deviceNode,
  deviceTime,
  markAllPending,
  mergeRemote,
  observeServerTime,
  onLocalWrite,
  useLibraryStore,
} from '../store/libraryStore';
import { uploadPendingPageFiles } from '../pageFiles';
import { markAttachmentUploaded } from '../store/actions';
import { setSyncState, useSyncStore } from '../store/syncStore';
import { rememberServerSettings, useSettingsStore, type ServerConfig } from '../store/settingsStore';
import { createTransport, fetchServerSettings, SyncError, uploadFile } from './transport';

const LONG_POLL_MS = 25_000;
const PUSH_DEBOUNCE_MS = 700;
const MAX_BACKOFF_MS = 60_000;
/** A long-poll answered faster than this with nothing waits this long before the next. */
const QUICK_ANSWER_MS = 1_000;
/** The last push on the way to the background: Android may freeze the app soon after. */
const FLUSH_TIMEOUT_MS = 15_000;

const store: SyncStore = {
  pendingRecords: limit => pendingRecords(limit),
  applyRemote: records => {
    mergeRemote(records);
  },
  acknowledge: records => acknowledge(records),
  readCursor: () => Number(readSyncState('cursor') ?? '0') || 0,
  writeCursor: cursor => writeSyncState('cursor', String(cursor)),
  // One value, written at once: the head and its run never go apart.
  readMark: () => parseMark(readSyncState('mark')),
  writeMark: mark => writeSyncState('mark', `${mark.run}:${mark.head}`),
  basesFor: records => basesFor(records),
  readEpoch: () => readSyncState('epoch'),
  writeEpoch: epoch => writeSyncState('epoch', epoch),
  markAllPending: () => {
    markAllPending();
    markAllFilesPending();
  },
  observeServerTime: (serverTime, localTime) => observeServerTime(serverTime, localTime),
  deviceTime: () => deviceTime(),
};

/** `run:head`, as `writeMark` stores it. */
function parseMark(value: string | null): ServerMark | null {
  const match = value ? /^([a-z0-9]{4,32}):(\d+)$/.exec(value) : null;
  return match ? { run: match[1]!, head: Number(match[2]) } : null;
}

let running = false;
/** In the background after a running loop: no loop, but every write still goes out (`flushNow`). */
let paused = false;
let generation = 0;
let inFlight: AbortController | null = null;
let waitingOnServer = false;
let wake: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;
let connectivity: (() => void) | null = null;
const beforePause = new Set<() => void>();
/** Photos the server refused (not an image it can read, too large): not retried until the next start. */
const refusedUploads = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    wake = () => {
      clearTimeout(timer);
      wake = null;
      resolve();
    };
  });
}

export function requestSync(): void {
  setSyncState({ pending: countPending() });
  if (!running) {
    // In the background, a write (an editor's last save, a reminder answered from its notification) still goes out.
    if (paused) {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushNow();
      }, PUSH_DEBOUNCE_MS);
    }
    return;
  }
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    if (waitingOnServer) inFlight?.abort();
    wake?.();
  }, PUSH_DEBOUNCE_MS);
}

/** A refusal is about that one photo (it is skipped); anything else is about the network, and backs off. */
const isRefusal = (error: unknown): boolean =>
  error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

async function uploadPending(config: ServerConfig): Promise<void> {
  const { attachments } = useLibraryStore.getState();
  for (const file of loadLocalFiles()) {
    if (file.uploaded || refusedUploads.has(file.id)) continue;
    const attachment = attachments[file.id];
    if (!attachment || attachment.deletedAt !== null) continue;
    try {
      await uploadFile(config, file);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refusedUploads.add(file.id);
      continue;
    }
    markFileUploaded(file.id);
    if (!attachment.uploaded) markAttachmentUploaded(file.id);
  }
}

async function loop(myGeneration: number): Promise<void> {
  let backoff = 0;
  // The first exchange answers at once, so the header's dot settles in a second.
  let first = true;
  // Back from the background while the last flush is still out: one exchange at a time.
  if (flushing) await flushing.catch(() => undefined);
  while (running && generation === myGeneration) {
    const config = useSettingsStore.getState().server;
    if (!config) {
      setSyncState({ phase: 'local', message: null });
      return;
    }
    const pending = countPending();
    waitingOnServer = pending === 0;
    inFlight = new AbortController();
    if (pending > 0) setSyncState({ phase: 'syncing', pending });
    try {
      const waitMs = pending === 0 && backoff === 0 && !first ? LONG_POLL_MS : 0;
      const started = Date.now();
      const outcome = await syncOnce(store, createTransport(config), { node: deviceNode(), waitMs, signal: inFlight.signal });
      backoff = 0;
      first = false;
      // A wait answered at once with nothing (a server stopping, a proxy that holds nothing) is not news: no tight loop.
      if (waitMs > 0 && outcome.pulled === 0 && outcome.pushed === 0 && Date.now() - started < QUICK_ANSWER_MS) await sleep(QUICK_ANSWER_MS);
      await uploadPending(config);
      await uploadPendingPageFiles(config);
      setSyncState({ phase: 'synced', lastSyncAt: Date.now(), pending: countPending(), message: null });
    } catch (error) {
      if (error instanceof SyncError && error.kind === 'aborted') continue;
      if (error instanceof SyncError && error.kind === 'unauthorized') {
        setSyncState({ phase: 'unauthorized', message: error.message, pending: countPending() });
        running = false;
        return;
      }
      // A server that says when to come back (stopping to restart) is believed; the doubling starts again after.
      const hinted = error instanceof SyncError ? error.retryAfterMs : null;
      backoff = hinted !== null ? Math.min(MAX_BACKOFF_MS, Math.max(1_000, hinted)) : backoff === 0 ? 2_000 : Math.min(MAX_BACKOFF_MS, backoff * 2);
      setSyncState({
        phase: 'offline',
        pending: countPending(),
        message: error instanceof Error ? error.message : t('Serveur injoignable'),
      });
      await sleep(backoff);
      if (hinted !== null) backoff = 1_000;
    } finally {
      inFlight = null;
      waitingOnServer = false;
    }
  }
}

export function startSync(): void {
  stopSync();
  if (!useSettingsStore.getState().server) {
    setSyncState({ phase: 'local', pending: countPending(), message: null });
    return;
  }
  running = true;
  generation += 1;
  refusedUploads.clear();
  // The network is back: a wait for the next retry ends now.
  connectivity ??= onOnline(() => {
    if (running && useSyncStore.getState().phase === 'offline') wake?.();
  });
  unsubscribe ??= onLocalWrite(requestSync);
  refreshReading();
  setSyncState({ pending: countPending(), phase: useSyncStore.getState().phase === 'local' ? 'syncing' : useSyncStore.getState().phase });
  loop(generation).catch(() => {
    running = false;
  });
}

/** Ask the server whether it reads links; remembered for links saved offline. */
export function refreshReading(): void {
  const config = useSettingsStore.getState().server;
  if (!config) return;
  fetchServerSettings(config).then(settings => {
    if (settings) rememberServerSettings(settings);
  });
}

/** Ends the loop; `keepListening` leaves local writes able to call for a push (`paused`). */
function halt(keepListening: boolean): void {
  running = false;
  generation += 1;
  if (!keepListening) {
    paused = false;
    unsubscribe?.();
    unsubscribe = null;
  }
  if (debounce) clearTimeout(debounce);
  debounce = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  // A pause gives up a held long-poll, not a push on its way: cut short, its answer is lost
  // although the server may have stored it, and the next push would start from a stale base.
  if (!keepListening || waitingOnServer) inFlight?.abort();
  wake?.();
}

export function stopSync(): void {
  halt(false);
}

/** Editors hand over what is typed but not yet saved, before the last push on the way out. */
export function onBeforePause(listener: () => void): () => void {
  beforePause.add(listener);
  return () => beforePause.delete(listener);
}

/** One exchange outside the loop, now: what is pending goes (the app is leaving, or runs headless for a notification). */
export function flushNow(): Promise<void> {
  if (flushing) return flushing.then(() => flushNow());
  const config = useSettingsStore.getState().server;
  if (!config || countPending() === 0) return Promise.resolve();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
  flushing = syncOnce(store, createTransport(config), { node: deviceNode(), waitMs: 0, signal: controller.signal })
    .then(() => setSyncState({ phase: 'synced', lastSyncAt: Date.now(), pending: countPending(), message: null }))
    .catch(() => setSyncState({ pending: countPending() }))
    .finally(() => {
      clearTimeout(timer);
      flushing = null;
    });
  return flushing;
}

/**
 * Off to the background: the long-poll ends, but what was typed a moment ago (in an editor's
 * debounce, in the push debounce, or in a push the stop cut short) is sent, and so is anything
 * written while the app stays in the background.
 */
export function pauseSync(): Promise<void> {
  for (const listener of beforePause) listener();
  // Paused already (a closing tab is hidden, then hidden away): still listening, still sending.
  const listening = running || paused;
  halt(listening);
  paused = listening;
  return listening ? flushNow() : Promise.resolve();
}
