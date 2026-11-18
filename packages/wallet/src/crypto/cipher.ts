/**
 * The wallet's cryptography, as each program hands it in: the packages import no library, so the
 * web app and the server's tools give `@noble/ciphers` and `hash-wasm`, the phone gives the same
 * AEAD in JavaScript and Argon2id from its Kotlin module (Bouncy Castle). Every program must give the
 * same bytes for the same inputs: `__tests__/vectors.test.ts` holds the vectors each one passes.
 *
 * - **XChaCha20-Poly1305** (IETF, 24-byte nonce, 16-byte tag appended): every sealed value and file.
 *   A random nonce per seal, safe at any count with 24 bytes.
 * - **Argon2id** v1.3, one lane, a 32-byte key: from the vault's passphrase (and the recovery code).
 */

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const TAG_BYTES = 16;
export const SALT_BYTES = 16;

/** Argon2id's cost: passes over the memory, and the memory in KiB. Kept beside what it derived, so it can rise later. */
export interface KdfParams {
  readonly ops: number;
  readonly memKiB: number;
}

/**
 * A passphrase's cost: 64 MiB, three passes (OWASP's and Bitwarden's floor for Argon2id), about a
 * second on a phone of 2022 and in a browser. A person types it once per device, then unlocks with
 * the fingerprint, or once per web session.
 */
export const PASSPHRASE_KDF: KdfParams = { ops: 3, memKiB: 64 * 1024 };

/** The recovery code already holds 160 random bits: Argon2id only stretches it to a key, cheaply. */
export const RECOVERY_KDF: KdfParams = { ops: 1, memKiB: 8 * 1024 };

/** The most a vault may ask, so a record cannot make a device spend a minute or its memory. */
export const KDF_CEILING: KdfParams = { ops: 10, memKiB: 1024 * 1024 };

export interface WalletCipher {
  /** Bytes from the platform's secure generator (`crypto.getRandomValues`, Android's `SecureRandom`). */
  random(length: number): Uint8Array;
  /** XChaCha20-Poly1305: the ciphertext, its tag appended. */
  seal(key: Uint8Array, nonce: Uint8Array, plain: Uint8Array, ad: Uint8Array): Uint8Array;
  /** The plain bytes, or null when the tag does not hold (another key, bytes altered, another place). */
  open(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, ad: Uint8Array): Uint8Array | null;
  /** Argon2id v1.3, parallelism 1, 32 bytes out. */
  argon2id(password: Uint8Array, salt: Uint8Array, params: KdfParams): Promise<Uint8Array>;
}

export const kdfFits = (params: KdfParams): boolean =>
  Number.isInteger(params.ops) && Number.isInteger(params.memKiB) && params.ops >= 1 && params.memKiB >= 8 && params.ops <= KDF_CEILING.ops && params.memKiB <= KDF_CEILING.memKiB;

/** Overwrites a key once it is no longer needed: what the language lets us do against a later memory read. */
export function wipe(...keys: readonly (Uint8Array | null | undefined)[]): void {
  for (const key of keys) key?.fill(0);
}
