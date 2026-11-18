/**
 * Wallet's library in this browser: its records as they sync (sealed: what IndexedDB keeps is what
 * the server keeps), and the items opened from them with the keys the vault holds now (`./vault`).
 * Opened items live in memory only: locking the vault drops them, and nothing opened is ever
 * written to storage, to the spotlight's index or to the search's.
 */
import { create } from 'zustand';

import type { SyncRecord } from '@unlease/core/sync/record';
import { ITEM_TYPE, VAULT_TYPE, type TierKeys, type VaultFields } from '@unlease/wallet/crypto/vault';
import type { ShownItem, WalletItem } from '@unlease/wallet/models/item';
import { itemFromRecord, vaultFromRecord } from '@unlease/wallet/sync/entities';
import { WALLET_TYPES } from '@unlease/wallet/sync/types';

import type { Projection } from '@shared/app/store/records';
import { browserCipher } from '../cipher';

export interface WalletState {
  /** The vault's fields, or null while none is known here (none made yet, or not synced yet). */
  readonly vault: VaultFields | null;
  /** Every item's record, sealed. */
  readonly records: Readonly<Record<string, SyncRecord>>;
  /** Every item as this browser can show it now: opened, or locked. */
  readonly items: Readonly<Record<string, ShownItem>>;
  /** Bumped by every change. */
  readonly revision: number;
}

const EMPTY: WalletState = { vault: null, records: {}, items: {}, revision: 0 };

export const useWalletStore = create<WalletState>(() => EMPTY);

/** The keys items are opened with; `./vault` sets them as it opens and locks. */
let keys: TierKeys = { cards: null, papers: null };

const open = (record: SyncRecord): ShownItem => itemFromRecord(browserCipher, record, keys);

export const walletProjection: Projection = {
  types: WALLET_TYPES,
  apply(changed, fresh) {
    useWalletStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let vault = base.vault;
      let records = base.records as Record<string, SyncRecord>;
      let items = base.items as Record<string, ShownItem>;
      for (const record of changed) {
        if (record.type === VAULT_TYPE) vault = vaultFromRecord(record) ?? vault;
        else if (record.type === ITEM_TYPE) {
          if (records === base.records) records = { ...base.records };
          if (items === base.items) items = { ...base.items };
          records[record.id] = record;
          items[record.id] = open(record);
        }
      }
      return { vault, records, items, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useWalletStore.setState(EMPTY, true);
  },
};

/** New keys (a tier opened or locked): every item opened again with them. */
export function setKeys(next: TierKeys): void {
  keys = next;
  useWalletStore.setState(state => {
    const items: Record<string, ShownItem> = {};
    for (const [id, record] of Object.entries(state.records)) items[id] = open(record);
    return { ...state, items, revision: state.revision + 1 };
  }, true);
}

export const currentKeys = (): TierKeys => keys;

/** The vault as stored, for a projection fed before the store (a test, the demo). */
export const vaultOf = (state: WalletState): VaultFields | null => state.vault;

/** The open items still live (not deleted). */
export function liveItems(items: WalletState['items']): WalletItem[] {
  return Object.values(items).filter((item): item is WalletItem => !item.locked && item.deletedAt === null);
}

/** Live items this browser cannot open now, by tier. */
export function lockedCount(state: WalletState, tier: 'cards' | 'papers'): number {
  return Object.values(state.items).filter(item => item.locked && item.tier === tier && item.deletedAt === null).length;
}
