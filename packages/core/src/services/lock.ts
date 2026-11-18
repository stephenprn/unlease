/**
 * The suite's lock: one password, set once, that opens what the person keeps out of sight (Carnet's
 * protected notes, Pages' protected pages). It hides; it does not encrypt: what it guards syncs, is
 * backed up and read by the server as anything else, and the apps show it only once the password is
 * typed (or, on a phone where it was typed once, the fingerprint). It guards against someone holding
 * an open phone or browser, not against someone reading the server.
 *
 * The password itself never travels: a check of it does (`LockCheck`, PBKDF2-HMAC-SHA256 over a salt),
 * kept in a synced record so every device asks the same one, offline too. Each program hands the
 * derivation in (`LockKdf`): the browser through `hash-wasm`, the phone through its Kotlin module, both
 * over the same ASCII form of the password (`lockSecret`), so they give the same bytes.
 */
import { fromBase64Url, toBase64Url, utf8 } from './bytes';

/**
 * The lock's record: one, of Carnet's type `lock` (declared in `notes/sync/types`, since every app that
 * locks something syncs Carnet's types), each field whole.
 */
export const LOCK_TYPE = 'lock';
export const LOCK_ID = 'lock';

/** The lock's record as the apps read it. */
export interface LockState {
  /** The password's check; null while none is set. */
  readonly check: string | null;
  /** When it was set (0: never). */
  readonly setAt: number;
  /** Carnet's protected section shows. */
  readonly section: boolean;
}

export const NO_LOCK: LockState = { check: null, setAt: 0, section: false };

/** The record's fields read, whatever is missing or not understood (a check this build cannot read counts as none). */
export function readLockFields(fields: Readonly<Record<string, unknown>> | undefined): LockState {
  if (!fields) return NO_LOCK;
  const check = readLockCheck(fields.check) ? (fields.check as string) : null;
  return { check, setAt: typeof fields.setAt === 'number' && Number.isFinite(fields.setAt) ? fields.setAt : 0, section: fields.section === true };
}

/** What derives a password's check: PBKDF2-HMAC-SHA256, 32 bytes, over `secret` (ASCII) and `salt` (base64url); the bytes in base64url. */
export interface LockKdf {
  random(length: number): Uint8Array;
  pbkdf2(secret: string, salt: string, iterations: number): Promise<string>;
}

/** OWASP's floor for PBKDF2-HMAC-SHA256 (2023): about a second on a phone, typed once per visit. */
export const LOCK_ITERATIONS = 600_000;
/** The most a check may ask, so a record cannot make a device spend a minute on it. */
export const LOCK_ITERATIONS_CEILING = 5_000_000;
export const LOCK_SALT_BYTES = 16;
const HASH_BYTES = 32;

/** The fewest characters the password may have. */
export const LOCK_PASSWORD_MIN = 6;

/** A password's check, as the lock's record keeps it (JSON in its `check` field). */
export interface LockCheck {
  readonly v: 1;
  readonly salt: string;
  readonly iterations: number;
  readonly hash: string;
}

/** The longest a check may be written: what the record type's field allows. */
export const LOCK_CHECK_CHARS = 300;

/**
 * The password as the derivation reads it, the same on every device: its letters composed (NFC), the
 * spaces at its ends dropped, then its UTF-8 bytes in base64url, so the phone's PBKDF2 (which reads
 * characters) and the browser's (which reads bytes) start from the same ASCII.
 */
export function lockSecret(password: string): string {
  const trimmed = password.trim();
  return toBase64Url(utf8(typeof trimmed.normalize === 'function' ? trimmed.normalize('NFC') : trimmed));
}

export function readLockCheck(value: unknown): LockCheck | null {
  if (typeof value !== 'string' || value.length > LOCK_CHECK_CHARS) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (raw.v !== 1 || typeof raw.salt !== 'string' || typeof raw.hash !== 'string' || typeof raw.iterations !== 'number') return null;
    if (!Number.isInteger(raw.iterations) || raw.iterations < 1000 || raw.iterations > LOCK_ITERATIONS_CEILING) return null;
    const salt = fromBase64Url(raw.salt);
    const hash = fromBase64Url(raw.hash);
    if (!salt || salt.length !== LOCK_SALT_BYTES || !hash || hash.length !== HASH_BYTES) return null;
    return { v: 1, salt: raw.salt, iterations: raw.iterations, hash: raw.hash };
  } catch {
    return null;
  }
}

/** Whether a field's value is a check a device can use: what the record type accepts (or '' for none). */
export const isLockCheck = (value: unknown): boolean => value === '' || readLockCheck(value) !== null;

/** A new password's check: the `check` field to write. */
export async function makeLockCheck(kdf: LockKdf, password: string, iterations: number = LOCK_ITERATIONS): Promise<string> {
  const salt = toBase64Url(kdf.random(LOCK_SALT_BYTES));
  const hash = await kdf.pbkdf2(lockSecret(password), salt, iterations);
  const check: LockCheck = { v: 1, salt, iterations, hash };
  return JSON.stringify(check);
}

/** Two texts compared whole, never stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  let differ = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) differ |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return differ === 0;
}

/** Whether `password` is the one `check` was made from. */
export async function lockOpens(kdf: LockKdf, check: unknown, password: string): Promise<boolean> {
  const read = readLockCheck(check);
  if (!read || !password.trim()) return false;
  const hash = await kdf.pbkdf2(lockSecret(password), read.salt, read.iterations);
  return sameText(hash, read.hash);
}

/**
 * What a phone keeps behind the fingerprint once the password was typed there: the check's own hash,
 * so a password changed on another device stops the fingerprint (it no longer matches) until it is
 * typed again on this one.
 */
export const lockStamp = (check: unknown): string | null => readLockCheck(check)?.hash ?? null;

/** Whether a forgotten password may be replaced: the server's token, typed whole, as this device holds it. */
export const tokenResets = (typed: string, held: string | null | undefined): boolean => !!held && typed.trim().length > 0 && sameText(typed.trim(), held.trim());
