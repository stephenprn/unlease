/**
 * Contacts' library: the suite's library engine (`@shared/app/store/library`: every record in memory,
 * written through to SQLite, merged with the server's) over Contacts' projection
 * (`contactsProjection`). Typed text edited here (a contact's note) keeps its base until the server
 * has it (`core/sync/bases`).
 */
import type { SyncRecord } from '@unlease/core/sync/record';
// Contacts' record types, declared before the first sync names what it pulls (`syncedTypes`).
import '@unlease/contacts/sync/types';
import { createLibrary, type LocalChange } from '@shared/app/store/library';

import { contactsProjection, type ContactsState } from './contactsProjection';

export type { LocalChange } from '@shared/app/store/library';

export type LibraryState = ContactsState;

const library = createLibrary<LibraryState>('contacts', contactsProjection());

export const useLibraryStore = library.useStore;

/** This device's clock node id: minted once, kept forever. */
export const deviceNode = (): string => library.deviceNode();
export const onLocalWrite = (listener: () => void): (() => void) => library.onLocalWrite(listener);
export const getRecord = (type: string, id: string): SyncRecord | undefined => library.getRecord(type, id);
export const loadLibrary = (now?: number): void => library.load(now);
/** One user action: every field of the batch shares one fresh clock. */
export const writeLocal = (changes: readonly LocalChange[], now?: number): void => library.writeLocal(changes, now);
/** The records that changed; a typed field changed here and elsewhere is merged as a fresh local write. */
export const mergeRemote = (incoming: readonly SyncRecord[], now?: number): SyncRecord[] => library.mergeRemote(incoming, now);
/** The server stored these copies: their pending marks go, and with them the bases of the typed text it now holds. */
export const acknowledge = (sent: readonly SyncRecord[]): void => library.acknowledge(sent);
/** This device's time, as sent with each request. */
export const deviceTime = (): number => library.deviceTime();
/** Saves an editor's typed field, merged with an edit that landed meanwhile (`actions.saveTypedText`). */
export const saveTypedField = (type: string, id: string, field: string, since: string | null, typed: string): string => library.saveTypedField(type, id, field, since, typed);
/** Test seam. */
export const resetLibrary = (): void => library.reset();
