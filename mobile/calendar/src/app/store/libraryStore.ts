/**
 * Agenda's library: the suite's library engine (`@shared/app/store/library`: every record in memory,
 * written through to SQLite, merged with the server's) over Agenda's projection (`calendarProjection`)
 * and those of the apps it shows, borrowed as leaves: Carnet's (`carnet`: its notes' reminders, the
 * gift ideas of « Cadeaux », the names of the notes and links mentioned), Contacts' (`people`: the
 * birthdays, the guests) and Pages' (`blocks`: the days written in pages, the pages mentioned).
 */
import type { SyncRecord } from '@unlease/core/sync/record';
// Every app's record types, declared before the first sync names what it pulls (`syncedTypes`).
import '@unlease/notes/sync/types';
import '@unlease/contacts/sync/types';
import '@unlease/pages/sync/types';
import '@unlease/calendar/sync/types';
import { combineProjections, createLibrary, type LocalChange } from '@shared/app/store/library';
import { notesProjection, type NotesState } from '@carnet/app/store/notesProjection';
import { contactsProjection, type ContactsState } from '@contacts-app/app/store/contactsProjection';
import { blocksProjection, type BlocksState } from '@pages-app/app/store/blocksProjection';

import { calendarProjection, type CalendarState } from './calendarProjection';
import { nested } from './nested';

export type { LocalChange } from '@shared/app/store/library';

export type LibraryState = CalendarState & BlocksState & { readonly carnet: NotesState; readonly people: ContactsState };

const library = createLibrary<LibraryState>(
  'calendar',
  combineProjections(combineProjections(combineProjections(calendarProjection(), blocksProjection()), nested('carnet', notesProjection())), nested('people', contactsProjection())) as never,
);

export const useLibraryStore = library.useStore;

/** This device's clock node id: minted once, kept forever. */
export const deviceNode = (): string => library.deviceNode();
export const onLocalWrite = (listener: () => void): (() => void) => library.onLocalWrite(listener);
export const getRecord = (type: string, id: string): SyncRecord | undefined => library.getRecord(type, id);
export const loadLibrary = (now?: number): void => library.load(now);
/** One user action: every field of the batch shares one fresh clock. */
export const writeLocal = (changes: readonly LocalChange[], now?: number): void => library.writeLocal(changes, now);
export const mergeRemote = (incoming: readonly SyncRecord[], now?: number): SyncRecord[] => library.mergeRemote(incoming, now);
export const acknowledge = (sent: readonly SyncRecord[]): void => library.acknowledge(sent);
export const deviceTime = (): number => library.deviceTime();
/** Saves an editor's typed field, merged with an edit that landed meanwhile. */
export const saveTypedField = (type: string, id: string, field: string, since: string | null, typed: string): string => library.saveTypedField(type, id, field, since, typed);
/** Test seam. */
export const resetLibrary = (): void => library.reset();
