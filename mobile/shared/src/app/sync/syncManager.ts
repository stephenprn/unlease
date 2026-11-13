/**
 * The foreground sync loop: always either a push or a long-poll the server holds open.
 * A local write aborts the long-poll and pushes (debounced); a refused token stops the loop.
 * Going to the background ends the loop, but what was just written still goes out.
 *
 * With the app closed, WorkManager runs the app's `syncTask` (`syncInBackground`): every quarter of
 * an hour, soon after the app leaves with changes unsent (retried until the server takes them), and
 * soon after a network, a VPN's too, comes up (`@shared/platform/backgroundSync`). Nothing written
 * here is ever dropped: a change stays pending, on the phone, until the server has answered for it.
 */
import { t } from '@unlease/core/i18n';
import { syncOnce, type SyncStore } from '@unlease/core/sync/engine';
import type { ServerMark } from '@unlease/core/sync/protocol';
import { schemaFingerprint } from '@unlease/core/sync/schema';
import { countPending, pendingRecords } from '@shared/data/repositories/recordRepository';
import { readSyncState, writeSyncState } from '@shared/data/repositories/stateRepository';
import { markAllFilesPending } from '@shared/data/repositories/fileRepository';
import { onOnline } from '@shared/platform/connectivity';
import { configureBackgroundSync, noteBackgroundSync, syncSoonInBackground, type BackgroundOutcome } from '@shared/platform/backgroundSync';

import { activeLibrary, syncedTypes } from '../store/library';
import { setSyncState, useSyncStore } from '../store/syncStore';
import { rememberServerSettings, useSettingsStore, type ServerConfig } from '../store/settingsStore';
import { createTransport, fetchServerSettings, SyncError } from './transport';

const LONG_POLL_MS = 25_000;
const PUSH_DEBOUNCE_MS = 700;
const MAX_BACKOFF_MS = 60_000;
/** A long-poll answered faster than this with nothing waits this long before the next. */
const QUICK_ANSWER_MS = 1_000;
/** The last push on the way to the background: Android may freeze the app soon after. */
const FLUSH_TIMEOUT_MS = 15_000;
/** One exchange with the app closed, many changes at once included; the files going up have their own limits. */
const BACKGROUND_TIMEOUT_MS = 90_000;
/** A background run after changes are left unsent: after the last push on the way out has had its chance. */
const SOON_AFTER_LEAVING_S = 20;
/** A change written with the app closed (a widget's tick, a notification's answer): a few in a row are one run. */
const SOON_AFTER_WRITE_S = 5;

/** The types the cursor was pulled with, as one value: another list (an app turned on, a newer build) pulls again from 0. */
const typesKey = (): string => syncedTypes().join(',');
/**
 * What this build knows of those types (`schemaFingerprint`): a newer build that knows a field or a
 * value the older one dropped from what it pulled pulls again from 0 too, so nothing stays missing.
 */
const schemaKey = (): string => schemaFingerprint(syncedTypes());

const store: SyncStore = {
  pendingRecords: limit => pendingRecords(limit),
  applyRemote: records => {
    activeLibrary().mergeRemote(records);
  },
  acknowledge: records => activeLibrary().acknowledge(records),
  readCursor: () => (readSyncState('cursorTypes') === typesKey() && readSyncState('cursorSchema') === schemaKey() ? Number(readSyncState('cursor') ?? '0') || 0 : 0),
  writeCursor: cursor => {
    writeSyncState('cursor', String(cursor));
    writeSyncState('cursorTypes', typesKey());
    writeSyncState('cursorSchema', schemaKey());
  },
  // One value, written at once: the head and its run never go apart.
  readMark: () => parseMark(readSyncState('mark')),
  writeMark: mark => writeSyncState('mark', `${mark.run}:${mark.head}`),
  basesFor: records => activeLibrary().basesFor(records),
  readEpoch: () => readSyncState('epoch'),
  writeEpoch: epoch => writeSyncState('epoch', epoch),
  markAllPending: () => {
    activeLibrary().markAllPending();
    markAllFilesPending();
  },
  observeServerTime: (serverTime, localTime) => activeLibrary().observeServerTime(serverTime, localTime),
  deviceTime: () => activeLibrary().deviceTime(),
};

/** The exchange with the server, naming the types this app syncs. */
const transportFor = (config: ServerConfig) => createTransport(config, syncedTypes());

/** `run:head`, as `writeMark` stores it. */
function parseMark(value: string | null): ServerMark | null {
  const match = value ? /^([a-z0-9]{4,32}):(\d+)$/.exec(value) : null;
  return match ? { run: match[1]!, head: Number(match[2]) } : null;
}

/**
 * Work an app does after each exchange (Carnet's photos, Pages' files going up): `run` throws to
 * back off as a failed exchange does; `restart` is called when the loop starts again.
 */
export interface SyncTask {
  run(config: ServerConfig): Promise<void>;
  restart?(): void;
  /** Files kept here that `run` would still send: counted with the changes waiting. */
  pending?(): number;
}

const tasks: SyncTask[] = [];

export function addSyncTask(task: SyncTask): () => void {
  tasks.push(task);
  return () => {
    const index = tasks.indexOf(task);
    if (index >= 0) tasks.splice(index, 1);
  };
}

/** Changes the server has not taken: records, and the files the apps still have to send. */
export function pendingCount(): number {
  let files = 0;
  for (const task of tasks) files += task.pending?.() ?? 0;
  return countPending() + files;
}

/** When a sync last got through, kept across starts: « synchronisé il y a 3 h » holds while offline. */
function storedLastSync(): number | null {
  const value = Number(readSyncState('lastSyncAt'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** An exchange (and the files after it) got through. */
function markSynced(): void {
  const at = Date.now();
  writeSyncState('lastSyncAt', String(at));
  setSyncState({ phase: 'synced', lastSyncAt: at, pending: pendingCount(), message: null });
}

/** What failed, in words: an exchange cut short by its own limit is a server that did not answer. */
function failureMessage(error: unknown): string {
  if (error instanceof SyncError && error.kind === 'aborted') return t('The server isn’t responding');
  return error instanceof Error ? error.message : t('Server unreachable');
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
  setSyncState({ pending: pendingCount() });
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
      const outcome = await syncOnce(store, transportFor(config), { node: activeLibrary().deviceNode(), waitMs, signal: inFlight.signal });
      backoff = 0;
      first = false;
      // A wait answered at once with nothing (a server stopping, a proxy that holds nothing) is not news: no tight loop.
      if (waitMs > 0 && outcome.pulled === 0 && outcome.pushed === 0 && Date.now() - started < QUICK_ANSWER_MS) await sleep(QUICK_ANSWER_MS);
      for (const task of tasks) await task.run(config);
      markSynced();
    } catch (error) {
      if (error instanceof SyncError && error.kind === 'aborted') continue;
      if (error instanceof SyncError && error.kind === 'unauthorized') {
        setSyncState({ phase: 'unauthorized', message: error.message, pending: pendingCount() });
        running = false;
        return;
      }
      // A server that says when to come back (stopping to restart) is believed; the doubling starts again after.
      const hinted = error instanceof SyncError ? error.retryAfterMs : null;
      backoff = hinted !== null ? Math.min(MAX_BACKOFF_MS, Math.max(1_000, hinted)) : backoff === 0 ? 2_000 : Math.min(MAX_BACKOFF_MS, backoff * 2);
      setSyncState({ phase: 'offline', pending: pendingCount(), message: failureMessage(error) });
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
    setSyncState({ phase: 'local', pending: pendingCount(), message: null });
    return;
  }
  running = true;
  generation += 1;
  for (const task of tasks) task.restart?.();
  // A network came (a VPN, home's Wi-Fi): a wait for the next retry ends now, and a long-poll held
  // over the network that was there before (its connection likely dead) is asked again over this one.
  connectivity ??= onOnline(() => {
    if (!running) return;
    if (waitingOnServer) inFlight?.abort();
    else if (useSyncStore.getState().phase === 'offline') wake?.();
  });
  unsubscribe ??= activeLibrary().onLocalWrite(requestSync);
  refreshReading();
  setSyncState({ pending: pendingCount(), lastSyncAt: useSyncStore.getState().lastSyncAt ?? storedLastSync(), phase: useSyncStore.getState().phase === 'local' ? 'syncing' : useSyncStore.getState().phase });
  loop(generation).catch(() => {
    running = false;
  });
}

/** Ask the server what it does (reads links, which apps it runs…); remembered for what is done offline. */
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
  if (countPending() === 0) return Promise.resolve();
  return exchangeNow();
}

/**
 * The app's `syncTask`, run by WorkManager with the app closed or in the background: one exchange
 * (what waits goes, what other devices wrote comes), then the files kept here go up. `retry` while
 * anything is left unsent, so the worker tries again with a growing wait; a refused token is not
 * retried (the Administration has to put it right). In front, the loop has it all already.
 */
export async function syncInBackground(): Promise<BackgroundOutcome> {
  // One exchange at a time: another may have started while this one waited for the last.
  while (flushing) await flushing.catch(() => undefined);
  const config = useSettingsStore.getState().server;
  if (!config || running) return 'done';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);
  const work = (async (): Promise<BackgroundOutcome> => {
    try {
      await syncOnce(store, transportFor(config), { node: activeLibrary().deviceNode(), waitMs: 0, signal: controller.signal });
      clearTimeout(timer);
      for (const task of tasks) await task.run(config);
      markSynced();
      return countPending() > 0 ? 'retry' : 'done';
    } catch (error) {
      if (error instanceof SyncError && error.kind === 'unauthorized') {
        setSyncState({ phase: 'unauthorized', message: error.message, pending: pendingCount() });
        return 'done';
      }
      setSyncState({ phase: 'offline', pending: pendingCount(), message: failureMessage(error) });
      // A pull that failed with nothing to send waits for the next period.
      return pendingCount() > 0 ? 'retry' : 'done';
    } finally {
      clearTimeout(timer);
    }
  })();
  const settled = work.then(() => undefined);
  flushing = settled;
  void settled.finally(() => {
    if (flushing === settled) flushing = null;
  });
  return work;
}

let watching = false;

/**
 * Once, at start (each app's bootstrap, wherever JavaScript runs): the background sync follows the
 * server's setting, hears what waits and when a sync last got through, and a change written with
 * the app closed (a widget, a notification) gets a run of its own.
 */
export function startBackgroundSync(): void {
  if (watching) return;
  watching = true;
  if (useSyncStore.getState().lastSyncAt === null) setSyncState({ lastSyncAt: storedLastSync(), pending: pendingCount() });
  configureBackgroundSync(useSettingsStore.getState().server !== null);
  useSettingsStore.subscribe(state => configureBackgroundSync(state.server !== null));
  noteBackgroundSync(useSyncStore.getState().pending, useSyncStore.getState().lastSyncAt);
  useSyncStore.subscribe(state => noteBackgroundSync(state.pending, state.lastSyncAt));
  activeLibrary().onLocalWrite(() => {
    if (running || !useSettingsStore.getState().server) return;
    setSyncState({ pending: pendingCount() });
    syncSoonInBackground(SOON_AFTER_WRITE_S);
  });
}

/**
 * One exchange outside the loop with nothing needed to send: what other devices wrote, for the app
 * running headless (its reminders seen to with the app closed). The loop, when it runs, has it already.
 */
export function pullNow(): Promise<void> {
  if (running) return Promise.resolve();
  if (flushing) return flushing.then(() => pullNow());
  return exchangeNow();
}

function exchangeNow(): Promise<void> {
  const config = useSettingsStore.getState().server;
  if (!config) return Promise.resolve();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
  flushing = syncOnce(store, transportFor(config), { node: activeLibrary().deviceNode(), waitMs: 0, signal: controller.signal })
    .then(() => markSynced())
    .catch(() => {
      setSyncState({ pending: pendingCount() });
      // Still unsent: the background sync takes it from here, once the server can be reached.
      if (pendingCount() > 0) syncSoonInBackground();
    })
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
  // Changes or files left to send: a background run follows, retried until the server takes them,
  // should the last push below fail or Android stop the app before it ends.
  if (listening && pendingCount() > 0) syncSoonInBackground(SOON_AFTER_LEAVING_S);
  return listening ? flushNow() : Promise.resolve();
}
