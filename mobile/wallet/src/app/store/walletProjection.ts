/**
 * Wallet's records in the phone's library: the vault and every item, sealed as they sync (SQLite keeps
 * what the server keeps), and the items opened with the keys the vault holds now (`./vault`). Opened
 * items live in memory only; new keys open them all again (`reopenItems`).
 */
import type { SyncRecord } from '@unlease/core/sync/record';
import { ITEM_TYPE, VAULT_TYPE, type TierKeys, type VaultFields } from '@unlease/wallet/crypto/vault';
import type { ShownItem, WalletItem } from '@unlease/wallet/models/item';
import { itemFromRecord, vaultFromRecord } from '@unlease/wallet/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

import { phoneCipher } from '../cipher';

export interface WalletState extends LibraryBase {
  readonly vault: VaultFields | null;
  readonly itemRecords: Readonly<Record<string, SyncRecord>>;
  readonly items: Readonly<Record<string, ShownItem>>;
}

const EMPTY: WalletState = { vault: null, itemRecords: {}, items: {}, revision: 0 };

let keys: TierKeys = { cards: null, papers: null };

export const currentKeys = (): TierKeys => keys;

const open = (record: SyncRecord): ShownItem => itemFromRecord(phoneCipher, record, keys);

export function walletProjection(): LibraryProjection<WalletState> {
  return {
    empty: EMPTY,
    decode(base, changed) {
      let vault = base.vault;
      let itemRecords = base.itemRecords as Record<string, SyncRecord>;
      let items = base.items as Record<string, ShownItem>;
      for (const record of changed) {
        if (record.type === VAULT_TYPE) vault = vaultFromRecord(record) ?? vault;
        else if (record.type === ITEM_TYPE) {
          if (itemRecords === base.itemRecords) itemRecords = { ...base.itemRecords };
          if (items === base.items) items = { ...base.items };
          itemRecords[record.id] = record;
          items[record.id] = open(record);
        }
      }
      return { ...base, vault, itemRecords, items };
    },
    clear() {
      // Nothing kept outside the state.
    },
  };
}

/** The keys changed: every item opened again (`./vault` sets them). */
export function itemsWith(next: TierKeys, records: Readonly<Record<string, SyncRecord>>): Record<string, ShownItem> {
  keys = next;
  const items: Record<string, ShownItem> = {};
  for (const [id, record] of Object.entries(records)) items[id] = open(record);
  return items;
}

export function liveItems(items: WalletState['items']): WalletItem[] {
  return Object.values(items).filter((item): item is WalletItem => !item.locked && item.deletedAt === null);
}
