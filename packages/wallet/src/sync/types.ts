/**
 * Wallet's record types, declared to the suite's sync (`@unlease/core/sync/schema`) when this module
 * loads. The server sees only what it must to sync, collect files and keep the vault whole: an item's
 * tier, its sealed key, its files' ids, its clocks and dates of creation and deletion. Every other
 * field is sealed on the device (`crypto/seal`): its check holds the seal's shape and length, never
 * what it says. A sealed field merges as a whole (the latest wins): sealed words cannot be merged.
 */
import { defineRecordTypes, ids, nullableTime, oneOf, signed, time, type Check } from '@unlease/core/sync/schema';
import { isSealed } from '../crypto/seal';
import { readDerivedSeal, WALLET_TIERS } from '../crypto/vault';
import { ITEM_LIMITS } from '../models/item';

/** A value sealed from so many plain bytes at most. */
const sealed = (maxPlainBytes: number): Check => signed(value => isSealed(value, maxPlainBytes), `sealed:${maxPlainBytes}`);
const derived: Check = signed(value => readDerivedSeal(value) !== null && (value as string).length <= 600, 'derivedSeal');

/** Small values sealed: a kind, a flag, a count. */
const SMALL = 200;

export const WALLET_RECORD_TYPES = defineRecordTypes({
  // The vault's keys (one record, id `vault`), each field whole: see `crypto/vault`.
  walletVault: {
    app: 'wallet',
    fields: {
      passphrase: derived,
      recovery: derived,
      cards: sealed(32),
      papers: sealed(32),
      createdAt: time,
    },
  },
  // A card or a paper. `key` is its own key sealed under its tier's; the rest under that key.
  walletItem: {
    app: 'wallet',
    fields: {
      tier: oneOf(WALLET_TIERS),
      key: sealed(32),
      kind: sealed(SMALL),
      title: sealed(ITEM_LIMITS.title),
      details: sealed(ITEM_LIMITS.details),
      notes: sealed(ITEM_LIMITS.notes),
      text: sealed(ITEM_LIMITS.text),
      usage: sealed(SMALL),
      favourite: sealed(SMALL),
      files: ids(ITEM_LIMITS.files * 2),
      createdAt: time,
      deletedAt: nullableTime,
    },
    defaults: { files: [], deletedAt: null },
  },
});

export type WalletRecordType = keyof typeof WALLET_RECORD_TYPES;

export const WALLET_TYPES = Object.keys(WALLET_RECORD_TYPES) as readonly WalletRecordType[];

export function isWalletType(value: string): value is WalletRecordType {
  return Object.hasOwn(WALLET_RECORD_TYPES, value);
}

/** The sealed fields of an item: written under its own key. */
export const SEALED_ITEM_FIELDS = ['kind', 'title', 'details', 'notes', 'text', 'usage', 'favourite'] as const;
export type SealedItemField = (typeof SEALED_ITEM_FIELDS)[number];

