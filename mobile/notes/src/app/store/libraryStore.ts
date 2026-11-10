/**
 * Carnet's library: the suite's library engine (`@shared/app/store/library`: every record in memory,
 * written through to SQLite, merged with the server's) over Carnet's projection (`notesProjection`)
 * Contacts' (`peopleProjection`: the people its formatted notes mention) and Agenda's
 * (`eventsProjection`: the events they mention), synced as Carnet reads them, `syncedTypes('notes')`. Typed text edited here keeps its base until the server has it
 * (`core/sync/bases`).
 */
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Fields } from '@unlease/core/sync/record';
import type { RecordType } from '@unlease/notes/sync/types';
// Carnet's record types, declared before the first sync names what it pulls (`syncedTypes`): Metro
// loads a module where it is first used, and a type is needed before any record is read.
import '@unlease/notes/sync/types';
// Contacts' too: Carnet reads them (`APPS.notes.reads`), to name the people its notes mention.
import '@unlease/contacts/sync/types';
// Agenda's too (`APPS.notes.reads`): its notes mention events.
import '@unlease/calendar/sync/types';
import { combineProjections, createLibrary } from '@shared/app/store/library';

import { notesProjection, type NotesState } from './notesProjection';
import { peopleProjection, type PeopleState } from './peopleProjection';
import { eventsProjection, type EventsState } from './eventsProjection';

export type LibraryState = NotesState & PeopleState & EventsState;

const library = createLibrary<LibraryState>('notes', combineProjections(combineProjections(notesProjection(), peopleProjection()), eventsProjection()));

export const useLibraryStore = library.useStore;

export interface LocalChange {
  readonly type: RecordType;
  readonly id: string;
  readonly patch: Fields;
}

/** This device's clock node id: minted once, kept forever. */
export const deviceNode = (): string => library.deviceNode();
export const onLocalWrite = (listener: () => void): (() => void) => library.onLocalWrite(listener);
export const getRecord = (type: RecordType, id: string): SyncRecord | undefined => library.getRecord(type, id);
export const loadLibrary = (now?: number): void => library.load(now);
/** One user action: every field of the batch shares one fresh clock. */
export const writeLocal = (changes: readonly LocalChange[], now?: number): void => library.writeLocal(changes, now);
/** The records that changed; a typed field changed here and elsewhere is merged as a fresh local write. */
export const mergeRemote = (incoming: readonly SyncRecord[], now?: number): SyncRecord[] => library.mergeRemote(incoming, now);
/** The server stored these copies: their pending marks go, and with them the bases of the typed text it now holds. */
export const acknowledge = (sent: readonly SyncRecord[]): void => library.acknowledge(sent);
/** The server lost or replaced its data: every record goes to it again. */
export const markAllPending = (): void => library.markAllPending();
/** For a push: where the unacknowledged typed text of these records started from. */
export const basesFor = (sent: readonly SyncRecord[]): SyncRecord[] => library.basesFor(sent);
export const observeServerTime = (serverTime: number, localTime?: number): void => library.observeServerTime(serverTime, localTime);
/** This device's time, as sent with each request. */
export const deviceTime = (): number => library.deviceTime();
/** A Keep import's records: merged like remote ones (own clocks), then marked pending. */
export const writeImported = (incoming: readonly SyncRecord[], now?: number): number => library.writeImported(incoming, now);
/** Saves an editor's typed field, merged with an edit that landed meanwhile (`actions.saveTypedText`). */
export const saveTypedField = (type: RecordType, id: string, field: string, since: string | null, typed: string): string => library.saveTypedField(type, id, field, since, typed);
/** Test seam. */
export const resetLibrary = (): void => library.reset();
