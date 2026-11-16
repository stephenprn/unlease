/**
 * Clock's library: the suite's library engine (`@shared/app/store/library`: every record in memory,
 * written through to SQLite, merged with the server's) over Clock's projection (`clockProjection`:
 * the alarms) and Agenda's, borrowed as a leaf (`calendarProjection`: the events and the calendars
 * subscribed to, which an alarm shows as it rings and the evening check reads). Clock syncs its own
 * types and Agenda's (`appsShownBy('clock')`).
 */
import type { SyncRecord } from '@unlease/core/sync/record';
// The record types it syncs, declared before the first sync names what it pulls (`syncedTypes`).
import '@unlease/calendar/sync/types';
import '@unlease/clock/sync/types';
import { combineProjections, createLibrary, type LocalChange } from '@shared/app/store/library';
import { calendarProjection, type CalendarState } from '@calendar-app/app/store/calendarProjection';

import { clockProjection, type ClockState } from './clockProjection';

export type { LocalChange } from '@shared/app/store/library';

export type LibraryState = ClockState & CalendarState;

const library = createLibrary<LibraryState>('clock', combineProjections(clockProjection(), calendarProjection()));

export const useLibraryStore = library.useStore;

/** This device's clock node id: minted once, kept forever. */
export const deviceNode = (): string => library.deviceNode();
export const onLocalWrite = (listener: () => void): (() => void) => library.onLocalWrite(listener);
export const getRecord = (type: string, id: string): SyncRecord | undefined => library.getRecord(type, id);
export const loadLibrary = (now?: number): void => library.load(now);
/** One user action: every field of the batch shares one fresh clock. */
export const writeLocal = (changes: readonly LocalChange[], now?: number): void => library.writeLocal(changes, now);
/** The records that changed. */
export const mergeRemote = (incoming: readonly SyncRecord[], now?: number): SyncRecord[] => library.mergeRemote(incoming, now);
/** The server stored these copies: their pending marks go. */
export const acknowledge = (sent: readonly SyncRecord[]): void => library.acknowledge(sent);
/** This device's time, as sent with each request. */
export const deviceTime = (): number => library.deviceTime();
/** Test seam. */
export const resetLibrary = (): void => library.reset();
