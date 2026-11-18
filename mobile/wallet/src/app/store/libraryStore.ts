/**
 * Wallet's library: the suite's library engine (`@shared/app/store/library`: every record in memory,
 * written through to SQLite, merged with the server's) over Wallet's projection, combined with
 * Contacts' (`contactsProjection`: whom a paper concerns, named), whose types it syncs too.
 */
import type { SyncRecord } from '@unlease/core/sync/record';
// Both apps' record types, declared before the first sync names what it pulls (`syncedTypes`).
import '@unlease/contacts/sync/types';
import '@unlease/calendar/sync/types';
import '@unlease/wallet/sync/types';
import { combineProjections, createLibrary, type LocalChange } from '@shared/app/store/library';
import { contactsProjection, type ContactsState } from '@contacts-app/app/store/contactsProjection';

import { walletProjection, type WalletState } from './walletProjection';

export type { LocalChange } from '@shared/app/store/library';

export type LibraryState = WalletState & ContactsState;

const library = createLibrary<LibraryState>('wallet', combineProjections(walletProjection(), contactsProjection()));

export const useLibraryStore = library.useStore;

export const deviceNode = (): string => library.deviceNode();
export const onLocalWrite = (listener: () => void): (() => void) => library.onLocalWrite(listener);
export const getRecord = (type: string, id: string): SyncRecord | undefined => library.getRecord(type, id);
export const loadLibrary = (now?: number): void => library.load(now);
/** One user action: every field of the batch shares one fresh clock. */
export const writeLocal = (changes: readonly LocalChange[], now?: number): void => library.writeLocal(changes, now);
export const mergeRemote = (incoming: readonly SyncRecord[], now?: number): SyncRecord[] => library.mergeRemote(incoming, now);
export const acknowledge = (sent: readonly SyncRecord[]): void => library.acknowledge(sent);
export const deviceTime = (): number => library.deviceTime();
/** Test seam. */
export const resetLibrary = (): void => library.reset();
