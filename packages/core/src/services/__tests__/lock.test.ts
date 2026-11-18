import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { fromBase64Url, toBase64Url } from '../bytes';
import { isLockCheck, lockOpens, lockSecret, lockStamp, makeLockCheck, readLockCheck, tokenResets, type LockKdf } from '../lock';

// Node's PBKDF2 over the secret's ASCII, as the phone's (Java's, over characters) and the browser's
// (hash-wasm, over bytes) read it: the three agree because the secret is ASCII.
const nodeKdf: LockKdf = {
  random: length => Uint8Array.from(randomBytes(length)),
  pbkdf2: (secret, salt, iterations) => Promise.resolve(toBase64Url(Uint8Array.from(pbkdf2Sync(Buffer.from(secret, 'ascii'), Buffer.from(fromBase64Url(salt)!), iterations, 32, 'sha256')))),
};

describe('the lock', () => {
  it('reads a password the same way on every device', () => {
    expect(lockSecret('  café  ')).toBe(lockSecret('café'));
    expect(lockSecret('pass word')).toBe('cGFzcyB3b3Jk');
    expect(/^[A-Za-z0-9_-]*$/.test(lockSecret('mot de passe ✓ 🔒'))).toBe(true);
  });

  it('gives the vector every program must give', async () => {
    // The same as `SuiteLockModule.kt`'s PBKDF2WithHmacSHA256 over these characters.
    const hash = await nodeKdf.pbkdf2(lockSecret('ouvre-toi'), 'AAAAAAAAAAAAAAAAAAAAAA', 1000);
    expect(hash).toBe(toBase64Url(Uint8Array.from(pbkdf2Sync('b3V2cmUtdG9p', Buffer.alloc(16), 1000, 32, 'sha256'))));
  });

  it('opens with its own password only', async () => {
    const check = await makeLockCheck(nodeKdf, 'ouvre-toi', 2000);
    expect(isLockCheck(check)).toBe(true);
    expect(await lockOpens(nodeKdf, check, 'ouvre-toi')).toBe(true);
    expect(await lockOpens(nodeKdf, check, ' ouvre-toi ')).toBe(true);
    expect(await lockOpens(nodeKdf, check, 'ouvre-moi')).toBe(false);
    expect(await lockOpens(nodeKdf, check, '')).toBe(false);
    expect(await lockOpens(nodeKdf, '', 'ouvre-toi')).toBe(false);
  });

  it('refuses a check it cannot trust', () => {
    expect(readLockCheck('{"v":1,"salt":"AAAAAAAAAAAAAAAAAAAAAA","iterations":99999999,"hash":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')).toBeNull();
    expect(readLockCheck('{"v":2}')).toBeNull();
    expect(readLockCheck('not json')).toBeNull();
    expect(isLockCheck('')).toBe(true);
    expect(isLockCheck('{}')).toBe(false);
  });

  it('stamps the fingerprint with the check, so a new password stops it', async () => {
    const first = await makeLockCheck(nodeKdf, 'ouvre-toi', 1000);
    const second = await makeLockCheck(nodeKdf, 'ouvre-toi', 1000);
    expect(lockStamp(first)).not.toBeNull();
    expect(lockStamp(first)).not.toBe(lockStamp(second));
  });

  it('resets with the server’s token alone', () => {
    expect(tokenResets(' secret-token ', 'secret-token')).toBe(true);
    expect(tokenResets('secret', 'secret-token')).toBe(false);
    expect(tokenResets('', '')).toBe(false);
    expect(tokenResets('x', null)).toBe(false);
  });
});
