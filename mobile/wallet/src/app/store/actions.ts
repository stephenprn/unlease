/**
 * What a person does in Wallet on the phone, each one batch (`writeLocal`): an item made, changed,
 * shown at a till, starred, deleted (and taken back). Every value is sealed here under the item's own
 * key; a tier still locked cannot be written to.
 */
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { ITEM_TYPE } from '@unlease/wallet/crypto/vault';
import { tierOfKind, type ItemKind, type WalletItem } from '@unlease/wallet/models/item';
import { eraseChanges } from '@unlease/wallet/services/erase';
import { blobIdsOf, itemKeyOf, newItemFields, sealItemValues, type NewItem, type SealedValues } from '@unlease/wallet/sync/entities';
import { requestSync } from '@shared/app/sync/syncManager';

import { phoneCipher } from '../cipher';
import { getRecord, useLibraryStore, writeLocal } from './libraryStore';
import { currentKeys } from './walletProjection';

export function itemKey(id: string): Uint8Array | null {
  const record = getRecord(ITEM_TYPE, id);
  return record ? itemKeyOf(phoneCipher, record, currentKeys()) : null;
}

/** A new item's id and key, before its files are sealed under it. */
export function prepareItem(kind: ItemKind, now = Date.now()): { readonly id: string; readonly key: Uint8Array } | null {
  if (!currentKeys()[tierOfKind(kind)]) return null;
  return { id: createId(now), key: phoneCipher.random(32) };
}

export function addItem(prepared: { readonly id: string; readonly key: Uint8Array }, item: NewItem, now = Date.now()): void {
  const tierKey = currentKeys()[tierOfKind(item.kind)];
  if (!tierKey) throw new Error('tier locked');
  const { fields } = newItemFields(phoneCipher, tierKey, prepared.id, item, now, prepared.key);
  writeLocal([{ type: ITEM_TYPE, id: prepared.id, patch: fields }], now);
  requestSync();
}

export function updateItem(id: string, values: SealedValues, now = Date.now()): boolean {
  const key = itemKey(id);
  if (!key) return false;
  const patch: Fields = sealItemValues(phoneCipher, key, id, values);
  if (values.details) patch.files = blobIdsOf(values.details);
  key.fill(0);
  writeLocal([{ type: ITEM_TYPE, id, patch }], now);
  if (values.details) requestSync();
  return true;
}

export function markUsed(item: WalletItem, now = Date.now()): void {
  updateItem(item.id, { usage: { count: item.usage.count + 1, at: now } }, now);
}

export const setFavourite = (item: WalletItem, favourite: boolean): boolean => updateItem(item.id, { favourite });

export function deleteItem(id: string, now = Date.now()): () => void {
  const before = getRecord(ITEM_TYPE, id)?.fields.deletedAt ?? null;
  writeLocal([{ type: ITEM_TYPE, id, patch: { deletedAt: now } }], now);
  return () => writeLocal([{ type: ITEM_TYPE, id, patch: { deletedAt: before } }]);
}

export function eraseWallet(chosen: ReadonlySet<string>, now = Date.now()): number {
  const changes = eraseChanges(Object.values(useLibraryStore.getState().items), chosen, now);
  writeLocal(
    changes.map(change => ({ type: change.type, id: change.id, patch: change.patch })),
    now,
  );
  return changes.length;
}
