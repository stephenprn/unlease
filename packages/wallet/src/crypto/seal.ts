/**
 * Sealed values, as they travel in records: `w1.` then base64url of the nonce and the ciphertext.
 * Each seal names its place as associated data (the record's type, id and field; a file's id), so a
 * sealed value moved to another field, record or file no longer opens: the server cannot swap a
 * passport's number into a loyalty card.
 *
 * A file is sealed whole, as bytes: `UWB1`, the nonce, the ciphertext. The phone's Kotlin module
 * writes and reads the same layout (`WalletCrypto.kt`).
 */
import { concatBytes, fromBase64Url, fromUtf8, toBase64Url, utf8 } from './bytes';
import { NONCE_BYTES, TAG_BYTES, type WalletCipher } from './cipher';

const PREFIX = 'w1.';

/** Where a value is sealed: its record's type, id and field. */
export const fieldPlace = (type: string, id: string, field: string): string => `unlease/wallet/1/${type}/${id}/${field}`;

/** Where a file is sealed: its blob's id. */
export const blobPlace = (blobId: string): string => `unlease/wallet/1/blob/${blobId}`;

/** How long a sealed value is, for so many plain bytes: what a record type's check allows. */
export const sealedLength = (plainBytes: number): number => PREFIX.length + Math.ceil(((NONCE_BYTES + plainBytes + TAG_BYTES) * 4) / 3);

export const isSealed = (value: unknown, maxPlainBytes: number): value is string =>
  typeof value === 'string' && value.startsWith(PREFIX) && value.length <= sealedLength(maxPlainBytes) && /^[A-Za-z0-9_-]+$/.test(value.slice(PREFIX.length));

export function sealBytes(cipher: WalletCipher, key: Uint8Array, plain: Uint8Array, place: string): string {
  const nonce = cipher.random(NONCE_BYTES);
  return PREFIX + toBase64Url(concatBytes(nonce, cipher.seal(key, nonce, plain, utf8(place))));
}

export function openBytes(cipher: WalletCipher, key: Uint8Array, sealed: unknown, place: string): Uint8Array | null {
  if (typeof sealed !== 'string' || !sealed.startsWith(PREFIX)) return null;
  const bytes = fromBase64Url(sealed.slice(PREFIX.length));
  if (!bytes || bytes.length < NONCE_BYTES + TAG_BYTES) return null;
  return cipher.open(key, bytes.subarray(0, NONCE_BYTES), bytes.subarray(NONCE_BYTES), utf8(place));
}

/** A value sealed as JSON. */
export const sealValue = (cipher: WalletCipher, key: Uint8Array, value: unknown, place: string): string => sealBytes(cipher, key, utf8(JSON.stringify(value)), place);

/** The value back, or `undefined` when it does not open or is not JSON. */
export function openValue(cipher: WalletCipher, key: Uint8Array, sealed: unknown, place: string): unknown {
  const bytes = openBytes(cipher, key, sealed, place);
  if (!bytes) return undefined;
  try {
    return JSON.parse(fromUtf8(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

/** `UWB1`: what starts a sealed file, so a file that is not one is told at once. */
export const BLOB_MAGIC = Uint8Array.from([0x55, 0x57, 0x42, 0x31]);

export function sealBlob(cipher: WalletCipher, key: Uint8Array, blobId: string, plain: Uint8Array): Uint8Array {
  const nonce = cipher.random(NONCE_BYTES);
  return concatBytes(BLOB_MAGIC, nonce, cipher.seal(key, nonce, plain, utf8(blobPlace(blobId))));
}

export function openBlob(cipher: WalletCipher, key: Uint8Array, blobId: string, sealed: Uint8Array): Uint8Array | null {
  const head = BLOB_MAGIC.length;
  if (sealed.length < head + NONCE_BYTES + TAG_BYTES || BLOB_MAGIC.some((byte, index) => sealed[index] !== byte)) return null;
  return cipher.open(key, sealed.subarray(head, head + NONCE_BYTES), sealed.subarray(head + NONCE_BYTES), utf8(blobPlace(blobId)));
}
