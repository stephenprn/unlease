/**
 * The sync loop, the web twin of the phone's `syncManager`.
 *
 * While the tab is visible and a server is configured, one exchange is always
 * either running or about to: a push when something changed here, or else a
 * long-poll the server holds open until something changes there (a link it
 * just read, an edit from the phone). A filed link therefore lands within a
 * second of the server finishing, with no polling schedule to tune.
 *
 * A local write interrupts a waiting long-poll and pushes after a short
 * debounce (typing a sentence is one push, not forty). A failed exchange backs
 * off from 2 s to a minute; a refused token stops the loop until the settings
 * change. A hidden tab stops altogether: a held request in a background tab
 * keeps a connection open for nobody, and the next visible moment catches up;
 * what was just typed is still sent on the way out (`pauseSync`).
 */
import { useEffect } from 'react';

import { t } from '@unlease/core/i18n';
import { isUploadableImage } from '@unlease/notes/services/media';
import { syncOnce, type SyncStore, type SyncTransport } from '@unlease/core/sync/engine';

import { removeStoredFile, readStoredFile, storedFileIds } from '../media/files';
import { markAttachmentUploaded } from '../store/actions';
import { markBlockFileUploaded } from '../store/pages';
import {
  acknowledge,
  basesFor,
  countPending,
  deviceNode,
  deviceTime,
  flushLibrary,
  markAllPending,
  mergeRemote,
  observeServerTime,
  onLocalWrite,
  pendingRecords,
  readCursor,
  readMark,
  readEpoch,
  useLibraryStore,
  writeCursor,
  writeEpoch,
  writeMark,
} from '../store/library';
import { setServerSettings } from '../store/serverSettings';
import { selectServer, useSettingsStore, type ServerConfig } from '../store/settings';
import { setSyncState, useSyncStore } from '../store/syncStatus';
import { createTransport, fetchServerSettings, SyncError, uploadBlob, uploadFile } from './transport';

export const LONG_POLL_MS = 25_000;
export const PUSH_DEBOUNCE_MS = 700;
const FIRST_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
/** A long-poll answered faster than this with nothing waits this long before the next. */
const QUICK_ANSWER_MS = 1_000;

const store: SyncStore = {
  pendingRecords: limit => pendingRecords(limit),
  applyRemote: records => {
    mergeRemote(records);
  },
  acknowledge: records => acknowledge(records),
  readCursor: () => readCursor(),
  writeCursor: cursor => writeCursor(cursor),
  readMark: () => readMark(),
  writeMark: mark => writeMark(mark),
  basesFor: records => basesFor(records),
  readEpoch: () => readEpoch(),
  writeEpoch: epoch => writeEpoch(epoch),
  markAllPending: () => markAllPending(),
  observeServerTime: (serverTime, localTime) => observeServerTime(serverTime, localTime),
  deviceTime: () => deviceTime(),
};

export type Uploader = (config: ServerConfig, id: string, blob: Blob, mime: string) => Promise<void>;

let transportFor: (config: ServerConfig, options?: { keepalive?: boolean }) => SyncTransport = createTransport;
let uploader: Uploader = uploadBlob;
let fileUploader: Uploader = uploadFile;

/** Swap the network for a stand-in: tests, and the dev-only demo. */
export function configureSync(options: { transportFor?: (config: ServerConfig, options?: { keepalive?: boolean }) => SyncTransport; uploader?: Uploader; fileUploader?: Uploader }): void {
  if (options.transportFor) transportFor = options.transportFor;
  if (options.uploader) uploader = options.uploader;
  if (options.fileUploader) fileUploader = options.fileUploader;
}

let running = false;
/** Hidden after a running loop: no loop, but every write still goes out (`flushNow`). */
let paused = false;
let generation = 0;
let inFlight: AbortController | null = null;
let waitingOnServer = false;
let wake: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;
const beforePause = new Set<() => void>();
/** Photos the server refused (too large, not an image): not retried this visit. */
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

export function isSyncRunning(): boolean {
  return running;
}

/** Something changed here: get it to the server soon. */
export function requestSync(): void {
  setSyncState({ pending: countPending() });
  if (!running) {
    // A hidden tab's write (an editor's last save) still goes out.
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

/** A note's photo, or the file of one or more page blocks (a copied block shares it): what an upload is for. */
function uploadOwner(id: string): { readonly done: boolean; readonly mime: string; readonly image: boolean; readonly mark: () => void } | null {
  const { attachments, blocks } = useLibraryStore.getState();
  const attachment = attachments[id];
  if (attachment) return { done: attachment.deletedAt !== null || attachment.uploaded, mime: attachment.mime, image: true, mark: () => markAttachmentUploaded(id) };
  const owners = Object.values(blocks).filter(block => block.fileId === id);
  if (owners.length === 0) return null;
  const live = owners.find(block => block.deletedAt === null && !block.uploaded);
  const mime = live?.mime ?? owners[0]!.mime;
  return { done: !live, mime, image: isUploadableImage(mime), mark: () => markBlockFileUploaded(id) };
}

async function uploadPending(config: ServerConfig, myGeneration: number): Promise<void> {
  for (const id of await storedFileIds()) {
    if (!running || generation !== myGeneration) return;
    if (refusedUploads.has(id)) continue;
    const owner = uploadOwner(id);
    // A file whose record never made it (a crash between the two writes) waits.
    if (!owner) continue;
    if (owner.done) {
      await removeStoredFile(id);
      continue;
    }
    const blob = await readStoredFile(id);
    if (!blob) continue;
    try {
      await (owner.image ? uploader : fileUploader)(config, id, blob, blob.type || owner.mime);
    } catch (error) {
      // A refusal is about this file; anything else is about the network, and backs off.
      if (error instanceof SyncError && error.kind === 'http' && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429) {
        refusedUploads.add(id);
        continue;
      }
      throw error;
    }
    owner.mark();
    await removeStoredFile(id);
  }
}

async function loop(myGeneration: number): Promise<void> {
  let backoff = 0;
  let first = true;
  // Visible again while the last flush is still out: one exchange at a time.
  if (flushing) await flushing.catch(() => undefined);
  while (running && generation === myGeneration) {
    const config = useSettingsStore.getState().server;
    if (!config) {
      setSyncState({ phase: 'local', message: null });
      return;
    }
    const pending = countPending();
    waitingOnServer = pending === 0;
    const controller = new AbortController();
    inFlight = controller;
    if (pending > 0) setSyncState({ phase: 'syncing', pending });
    try {
      // The first exchange answers at once, so the header's dot settles in a second (as on the phone).
      const waitMs = pending === 0 && backoff === 0 && !first ? LONG_POLL_MS : 0;
      const started = Date.now();
      const outcome = await syncOnce(store, transportFor(config), { node: deviceNode(), waitMs, signal: controller.signal });
      backoff = 0;
      first = false;
      // A wait answered at once with nothing (a server stopping, a proxy that holds nothing) is not news: no tight loop.
      if (waitMs > 0 && outcome.pulled === 0 && outcome.pushed === 0 && Date.now() - started < QUICK_ANSWER_MS) await sleep(QUICK_ANSWER_MS);
      await uploadPending(config, myGeneration);
      if (running && generation === myGeneration) {
        setSyncState({ phase: 'synced', lastSyncAt: Date.now(), pending: countPending(), message: null });
      }
    } catch (error) {
      if (error instanceof SyncError && error.kind === 'aborted') continue;
      if (error instanceof SyncError && error.kind === 'unauthorized') {
        setSyncState({ phase: 'unauthorized', message: error.message, pending: countPending() });
        running = false;
        return;
      }
      // A server that says when to come back (stopping to restart) is believed; the doubling starts again after.
      const hinted = error instanceof SyncError ? error.retryAfterMs : null;
      backoff = hinted !== null ? Math.min(MAX_BACKOFF_MS, Math.max(1_000, hinted)) : backoff === 0 ? FIRST_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, backoff * 2);
      setSyncState({
        phase: 'offline',
        pending: countPending(),
        message: error instanceof Error ? error.message : t('Serveur injoignable'),
      });
      await sleep(backoff);
      if (hinted !== null) backoff = FIRST_BACKOFF_MS / 2;
    } finally {
      if (inFlight === controller) inFlight = null;
      waitingOnServer = false;
    }
  }
}

/** Start (or restart) the loop: tab visible, or settings changed. */
export function startSync(): void {
  stopSync();
  if (!useSettingsStore.getState().server) {
    setSyncState({ phase: 'local', pending: countPending(), message: null });
    return;
  }
  running = true;
  generation += 1;
  unsubscribe ??= onLocalWrite(requestSync);
  refreshReading();
  const phase = useSyncStore.getState().phase;
  setSyncState({ pending: countPending(), phase: phase === 'local' || phase === 'unauthorized' ? 'syncing' : phase });
  loop(generation).catch(() => {
    running = false;
  });
}

/** Ask the server whether it reads links; remembered for links saved offline (the phone's `refreshReading`). */
export function refreshReading(): void {
  const config = useSettingsStore.getState().server;
  if (!config) return;
  void fetchServerSettings(config).then(settings => {
    // A late answer for a server that is no longer the one configured is dropped.
    if (settings && useSettingsStore.getState().server?.url === config.url) setServerSettings(settings);
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
  inFlight = null;
  wake?.();
}

export function stopSync(): void {
  halt(false);
}

/** The last push on the way out: a hidden tab may be frozen, a closed one gone. */
const FLUSH_TIMEOUT_MS = 15_000;

/** Editors hand over what is typed but not yet saved, before the last push on the way out. */
export function onBeforePause(listener: () => void): () => void {
  beforePause.add(listener);
  return () => void beforePause.delete(listener);
}

/** One exchange outside the loop, now: what is pending goes, in a request that outlives the page when small enough. */
export function flushNow(): Promise<void> {
  if (flushing) return flushing.then(() => flushNow());
  const config = useSettingsStore.getState().server;
  if (!config || countPending() === 0) return Promise.resolve();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
  flushing = syncOnce(store, transportFor(config, { keepalive: true }), { node: deviceNode(), waitMs: 0, signal: controller.signal })
    .then(() => setSyncState({ phase: 'synced', lastSyncAt: Date.now(), pending: countPending(), message: null }))
    .catch(() => setSyncState({ pending: countPending() }))
    .finally(() => {
      clearTimeout(timer);
      flushing = null;
    });
  return flushing;
}

/**
 * The tab is hidden or closing: the long-poll ends, but what was typed a moment ago (in an
 * editor's debounce, in the push debounce, or in a push the stop cut short) is sent, and so is
 * anything written while the tab stays hidden.
 */
export function pauseSync(): Promise<void> {
  for (const listener of beforePause) listener();
  // Whatever the editors just wrote goes to disk too, in case the page is closing.
  void flushLibrary();
  // Paused already (a closing tab is hidden, then hidden away): still listening, still sending.
  const listening = running || paused;
  halt(listening);
  paused = listening;
  return listening ? flushNow() : Promise.resolve();
}

/** The network came back: stop waiting out the backoff. */
function onOnline(): void {
  if (running) wake?.();
  else if (document.visibilityState === 'visible') startSync();
}

/** The network went away: drop the held request so the dot says so now, not in 45 s. */
function onOffline(): void {
  if (!running) return;
  setSyncState({ phase: 'offline', message: t('Pas de réseau') });
  inFlight?.abort();
}

/**
 * Runs the loop while the tab is visible, restarting it when the server
 * settings change. Mounted once, at the root of the app.
 */
export function useSyncLifecycle(): void {
  const server = useSettingsStore(selectServer);
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') startSync();
      else void pauseSync();
    };
    const onPageHide = (): void => void pauseSync();
    if (document.visibilityState === 'visible') startSync();
    else setSyncState({ pending: countPending(), phase: server ? useSyncStore.getState().phase : 'local' });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      stopSync();
    };
  }, [server]);
}
