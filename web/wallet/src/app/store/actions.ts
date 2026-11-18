/**
 * What a person does in Wallet, each one batch (`writeLocal`): an item made, changed, used at a till,
 * starred, deleted (and taken back). Every value is sealed here under the item's own key before it is
 * written; a tier still locked cannot be written to.
 */
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { ITEM_TYPE } from '@unlease/wallet/crypto/vault';
import { tierOfKind, type ItemDetails, type WalletItem } from '@unlease/wallet/models/item';
import { eraseChanges } from '@unlease/wallet/services/erase';
import { blobIdsOf, itemKeyOf, newItemFields, sealItemValues, type NewItem, type SealedValues } from '@unlease/wallet/sync/entities';

import { getRecord, writeLocal } from '@shared/app/store/records';
import { requestSync } from '@shared/app/sync/loop';
import { browserCipher } from '../cipher';
import { currentKeys, useWalletStore } from './library';

/** The key an item's values and files are sealed under, while its tier is open here. */
export function itemKey(id: string): Uint8Array | null {
  const record = getRecord(ITEM_TYPE, id);
  return record ? itemKeyOf(browserCipher, record, currentKeys()) : null;
}

/** A new item's id and key, before its files are sealed (they are sealed under its key). */
export function prepareItem(kind: NewItem['kind'], now = Date.now()): { readonly id: string; readonly key: Uint8Array } | null {
  const tierKey = currentKeys()[tierOfKind(kind)];
  if (!tierKey) return null;
  return { id: createId(now), key: browserCipher.random(32) };
}

/** A new item, written whole; its files were sealed under `key` (`prepareItem`). */
export function addItem(prepared: { readonly id: string; readonly key: Uint8Array }, item: NewItem, now = Date.now()): void {
  const tierKey = currentKeys()[tierOfKind(item.kind)];
  if (!tierKey) throw new Error('tier locked');
  const { fields } = newItemFields(browserCipher, tierKey, prepared.id, item, now, prepared.key);
  writeLocal([{ type: ITEM_TYPE, id: prepared.id, patch: fields }], now);
  prepared.key.fill(0);
  requestSync();
}

/** Some of an item's values changed: one batch. Its files' ids follow its details. */
export function updateItem(id: string, values: SealedValues, now = Date.now()): boolean {
  const key = itemKey(id);
  if (!key) return false;
  const patch: Fields = sealItemValues(browserCipher, key, id, values);
  if (values.details) patch.files = blobIdsOf(values.details);
  key.fill(0);
  writeLocal([{ type: ITEM_TYPE, id, patch }], now);
  if (values.details) requestSync();
  return true;
}

/** Shown at a till (or opened): counted once, for « Cartes »' order. */
export function markUsed(item: WalletItem, now = Date.now()): void {
  updateItem(item.id, { usage: { count: item.usage.count + 1, at: now } }, now);
}

export const setFavourite = (item: WalletItem, favourite: boolean): boolean => updateItem(item.id, { favourite });

/** Deleted for good on every device; the returned function takes it back. */
export function deleteItem(id: string, now = Date.now()): () => void {
  const record = getRecord(ITEM_TYPE, id);
  writeLocal([{ type: ITEM_TYPE, id, patch: { deletedAt: now } }], now);
  const before = record?.fields.deletedAt ?? null;
  return () => writeLocal([{ type: ITEM_TYPE, id, patch: { deletedAt: before } }]);
}

/** The details changed by `change`, written. */
export function changeDetails(item: WalletItem, change: (details: ItemDetails) => ItemDetails): boolean {
  return updateItem(item.id, { details: change(item.details) });
}

/** « Effacer des données »: the parts ticked, as tombstones, one batch. */
export function eraseWallet(chosen: ReadonlySet<string>, now = Date.now()): number {
  const changes = eraseChanges(Object.values(useWalletStore.getState().items), chosen, now);
  writeLocal(
    changes.map(change => ({ type: change.type, id: change.id, patch: change.patch })),
    now,
  );
  return changes.length;
}
