/**
 * The suite's lock on Android, through the SuiteLock TurboModule (`specs/NativeSuiteLock.ts`), in the
 * apps that register it (Carnet, Pages). Missing (another app, the tests), nothing derives and no
 * fingerprint is offered.
 */
import type { LockKdf } from '@unlease/core/services/lock';
import { fromBase64Url } from '@unlease/core/services/bytes';

import NativeSuiteLock, { type Spec } from '../../specs/NativeSuiteLock';

export const lockNative = (): Spec | null => NativeSuiteLock ?? null;

/** PBKDF2 natively, randomness from SecureRandom; null without the module. */
export function phoneKdf(): LockKdf | null {
  const native = NativeSuiteLock;
  if (!native) return null;
  return {
    random: length => fromBase64Url(native.randomBytes(length)) ?? new Uint8Array(length),
    pbkdf2: (secret, salt, iterations) => native.pbkdf2(secret, salt, iterations),
  };
}
