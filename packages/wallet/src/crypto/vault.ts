/**
 * The vault's keys, as Bitwarden and Proton Pass lay theirs out:
 *
 * - a random **master key**, never stored as such: it is sealed under a key Argon2id derives from the
 *   passphrase (`passphrase`), and again under one derived from the recovery code (`recovery`);
 * - two **tier keys**, random, sealed under the master key: `cards` (loyalty cards, gift cards, the
 *   emergency card: open on a phone without asking, so they reach the till fast) and `papers`
 *   (identity papers and documents: the fingerprint or the passphrase each time);
 * - a key per **item**, sealed under its tier's key (the item's `key` field), which seals its fields
 *   and its files; so an item can later be shared on its own.
 *
 * The vault is one record (`walletVault`, id `vault`), each of whose fields is whole: changing the
 * passphrase rewrites `passphrase` alone, and the master key does not change, so nothing else is
 * sealed again. It is created once, by the server's `POST /api/wallet/vault`, which keeps the first
 * one sent: two devices creating a vault at once end up with one.
 */
import { fromBase32, fromBase64Url, toBase32, toBase64Url, utf8 } from './bytes';
import { KEY_BYTES, kdfFits, PASSPHRASE_KDF, RECOVERY_KDF, SALT_BYTES, wipe, type KdfParams, type WalletCipher } from './cipher';
import { fieldPlace, openBytes, sealBytes } from './seal';

export const VAULT_TYPE = 'walletVault';
export const VAULT_ID = 'vault';
export const ITEM_TYPE = 'walletItem';

export const WALLET_TIERS = ['cards', 'papers'] as const;
export type WalletTier = (typeof WALLET_TIERS)[number];

/** A key sealed under another derived by Argon2id: the salt and the cost travel with it. */
export interface DerivedSeal {
  readonly v: 1;
  readonly salt: string;
  readonly ops: number;
  readonly mem: number;
  readonly key: string;
}

/** The vault record's fields, as they sync. */
export interface VaultFields {
  readonly passphrase: string;
  readonly recovery: string;
  readonly cards: string;
  readonly papers: string;
  readonly createdAt: number;
}

/** The tier keys a device holds now: a tier still locked is null. */
export interface TierKeys {
  readonly cards: Uint8Array | null;
  readonly papers: Uint8Array | null;
}

export interface OpenVault {
  readonly master: Uint8Array;
  readonly cards: Uint8Array;
  readonly papers: Uint8Array;
}

/** 20 random bytes: 32 characters of Crockford's base32, eight groups of four on the recovery kit. */
export const RECOVERY_BYTES = 20;

const place = (field: string): string => fieldPlace(VAULT_TYPE, VAULT_ID, field);

/** How a passphrase is typed on any device: the same letters give the same bytes (NFC), spaces at its ends dropped. */
export function passphraseBytes(passphrase: string): Uint8Array {
  const trimmed = passphrase.trim();
  return utf8(typeof trimmed.normalize === 'function' ? trimmed.normalize('NFC') : trimmed);
}

async function derivedSeal(cipher: WalletCipher, secret: Uint8Array, master: Uint8Array, field: string, params: KdfParams): Promise<string> {
  const salt = cipher.random(SALT_BYTES);
  const key = await cipher.argon2id(secret, salt, params);
  try {
    const sealed: DerivedSeal = { v: 1, salt: toBase64Url(salt), ops: params.ops, mem: params.memKiB, key: sealBytes(cipher, key, master, place(field)) };
    return JSON.stringify(sealed);
  } finally {
    wipe(key);
  }
}

export function readDerivedSeal(value: unknown): DerivedSeal | null {
  if (typeof value !== 'string') return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (raw.v !== 1 || typeof raw.salt !== 'string' || typeof raw.key !== 'string' || typeof raw.ops !== 'number' || typeof raw.mem !== 'number') return null;
    if (!kdfFits({ ops: raw.ops, memKiB: raw.mem })) return null;
    const salt = fromBase64Url(raw.salt);
    if (!salt || salt.length !== SALT_BYTES) return null;
    return { v: 1, salt: raw.salt, ops: raw.ops, mem: raw.mem, key: raw.key };
  } catch {
    return null;
  }
}

async function openDerived(cipher: WalletCipher, secret: Uint8Array, value: unknown, field: string): Promise<Uint8Array | null> {
  const sealed = readDerivedSeal(value);
  if (!sealed) return null;
  const key = await cipher.argon2id(secret, fromBase64Url(sealed.salt)!, { ops: sealed.ops, memKiB: sealed.mem });
  try {
    const master = openBytes(cipher, key, sealed.key, place(field));
    return master && master.length === KEY_BYTES ? master : null;
  } finally {
    wipe(key);
  }
}

/** The recovery code as printed: `ABCD-EFGH-…`, eight groups of four. */
export const formatRecoveryCode = (bytes: Uint8Array): string => (toBase32(bytes).match(/.{1,4}/g) ?? []).join('-');

/** The code typed back, or null when it cannot be one (a missing character, a letter base32 has not). */
export const readRecoveryCode = (typed: string): Uint8Array | null => fromBase32(typed, RECOVERY_BYTES);

export interface NewVault {
  readonly fields: VaultFields;
  readonly keys: OpenVault;
  /** Shown once, for the recovery kit: never stored. */
  readonly recoveryCode: string;
}

export async function createVault(cipher: WalletCipher, passphrase: string, now: number, params: KdfParams = PASSPHRASE_KDF): Promise<NewVault> {
  const master = cipher.random(KEY_BYTES);
  const cards = cipher.random(KEY_BYTES);
  const papers = cipher.random(KEY_BYTES);
  const recovery = cipher.random(RECOVERY_BYTES);
  const secret = passphraseBytes(passphrase);
  try {
    const fields: VaultFields = {
      passphrase: await derivedSeal(cipher, secret, master, 'passphrase', params),
      recovery: await derivedSeal(cipher, recovery, master, 'recovery', RECOVERY_KDF),
      cards: sealBytes(cipher, master, cards, place('cards')),
      papers: sealBytes(cipher, master, papers, place('papers')),
      createdAt: now,
    };
    return { fields, keys: { master, cards, papers }, recoveryCode: formatRecoveryCode(recovery) };
  } finally {
    wipe(secret, recovery);
  }
}

function openTiers(cipher: WalletCipher, fields: Pick<VaultFields, 'cards' | 'papers'>, master: Uint8Array): OpenVault | null {
  const cards = openBytes(cipher, master, fields.cards, place('cards'));
  const papers = openBytes(cipher, master, fields.papers, place('papers'));
  if (!cards || !papers || cards.length !== KEY_BYTES || papers.length !== KEY_BYTES) return null;
  return { master, cards, papers };
}

/** The vault opened by its passphrase, or null when the passphrase is not this vault's. */
export async function openWithPassphrase(cipher: WalletCipher, fields: VaultFields, passphrase: string): Promise<OpenVault | null> {
  const secret = passphraseBytes(passphrase);
  try {
    const master = await openDerived(cipher, secret, fields.passphrase, 'passphrase');
    return master ? openTiers(cipher, fields, master) : null;
  } finally {
    wipe(secret);
  }
}

/** The vault opened by its recovery code, or null when the code is not this vault's. */
export async function openWithRecovery(cipher: WalletCipher, fields: VaultFields, typed: string): Promise<OpenVault | null> {
  const code = readRecoveryCode(typed);
  if (!code) return null;
  try {
    const master = await openDerived(cipher, code, fields.recovery, 'recovery');
    return master ? openTiers(cipher, fields, master) : null;
  } finally {
    wipe(code);
  }
}

/** A new passphrase: the `passphrase` field to write. The old one no longer opens the vault once it syncs. */
export const passphraseField = (cipher: WalletCipher, master: Uint8Array, passphrase: string, params: KdfParams = PASSPHRASE_KDF): Promise<string> => {
  const secret = passphraseBytes(passphrase);
  return derivedSeal(cipher, secret, master, 'passphrase', params).finally(() => wipe(secret));
};

/** A new recovery code (the old kit is lost, or was seen): the `recovery` field to write, and the code to print. */
export async function newRecovery(cipher: WalletCipher, master: Uint8Array): Promise<{ readonly field: string; readonly code: string }> {
  const recovery = cipher.random(RECOVERY_BYTES);
  try {
    return { field: await derivedSeal(cipher, recovery, master, 'recovery', RECOVERY_KDF), code: formatRecoveryCode(recovery) };
  } finally {
    wipe(recovery);
  }
}

/** An item's own key, sealed under its tier's: what its `key` field holds. */
export const sealItemKey = (cipher: WalletCipher, tierKey: Uint8Array, itemId: string, itemKey: Uint8Array): string => sealBytes(cipher, tierKey, itemKey, fieldPlace(ITEM_TYPE, itemId, 'key'));

export function openItemKey(cipher: WalletCipher, tierKey: Uint8Array, itemId: string, sealed: unknown): Uint8Array | null {
  const key = openBytes(cipher, tierKey, sealed, fieldPlace(ITEM_TYPE, itemId, 'key'));
  return key && key.length === KEY_BYTES ? key : null;
}

export const newKey = (cipher: WalletCipher): Uint8Array => cipher.random(KEY_BYTES);
