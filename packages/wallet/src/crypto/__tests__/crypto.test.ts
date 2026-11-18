import crypto from 'node:crypto';
import { fromBase32, fromBase64Url, fromUtf8, toBase32, toBase64Url, utf8 } from '../bytes';
import { fieldPlace, isSealed, openBlob, openBytes, openValue, sealBlob, sealBytes, sealedLength, sealValue } from '../seal';
import { createVault, formatRecoveryCode, newRecovery, openItemKey, openWithPassphrase, openWithRecovery, passphraseField, readRecoveryCode, sealItemKey } from '../vault';
import { TEST_KDF, testCipher } from './testCipher';

const hex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!.map(byte => parseInt(byte, 16)));
const toHex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

describe('bytes', () => {
  it('writes UTF-8 as TextEncoder does, and reads it back', () => {
    for (const text of ['', 'abc', 'Évry à 7 h', 'œuvre', '日本語', 'emoji 🪪 and 👩‍👩‍👧', '\ud800 lone']) {
      expect(toHex(utf8(text))).toBe(toHex(new TextEncoder().encode(text)));
      expect(fromUtf8(utf8(text))).toBe(new TextDecoder().decode(new TextEncoder().encode(text)));
    }
  });

  it('reads broken UTF-8 as replacement characters', () => {
    expect(fromUtf8(Uint8Array.from([0x61, 0xc3]))).toBe('a�');
    expect(fromUtf8(Uint8Array.from([0xff, 0x62]))).toBe('�b');
  });

  it('round-trips base64url, and refuses what is not', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) & 255);
      const text = toBase64Url(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64url'));
      expect(toHex(fromBase64Url(text)!)).toBe(toHex(bytes));
    }
    expect(fromBase64Url('ab+c')).toBeNull();
    expect(fromBase64Url('a')).toBeNull();
    expect(fromBase64Url('AB')).toBeNull(); // leftover bits not zero
  });

  it('round-trips base32 and forgives what a person copies wrong', () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, i) => i * 13);
    const text = toBase32(bytes);
    expect(text).toHaveLength(32);
    expect(toHex(fromBase32(text, 20)!)).toBe(toHex(bytes));
    const sloppy = text.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/(.{4})/g, '$1 - ');
    expect(toHex(fromBase32(sloppy, 20)!)).toBe(toHex(bytes));
    expect(fromBase32(text.slice(1), 20)).toBeNull();
    expect(fromBase32(`${text.slice(0, -1)}U`, 20)).toBeNull();
  });
});

describe('the primitives every program must match', () => {
  it('XChaCha20-Poly1305: draft-irtf-cfrg-xchacha, A.3.1', () => {
    const plain = utf8("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
    const ad = hex('50515253c0c1c2c3c4c5c6c7');
    const key = hex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
    const nonce = hex('404142434445464748494a4b4c4d4e4f5051525354555657');
    const sealed = testCipher.seal(key, nonce, plain, ad);
    expect(toHex(sealed.slice(-16))).toBe('c0875924c1c7987947deafd8780acf49');
    expect(toHex(sealed.slice(0, 16))).toBe('bd6d179d3e83d43b9576579493c0e939');
    expect(fromUtf8(testCipher.open(key, nonce, sealed, ad)!)).toBe(fromUtf8(plain));
  });

  it('Argon2id: one lane, as the vault derives, matching OpenSSL’s (Node’s) and a fixed vector', async () => {
    const one = await testCipher.argon2id(utf8('correct horse battery staple'), utf8('unlease-wallet!!'), { ops: 3, memKiB: 64 });
    expect(toHex(one)).toBe(ARGON2ID_VECTOR);
    const node = crypto as unknown as { argon2Sync?: (algorithm: string, params: Record<string, unknown>) => Buffer };
    if (node.argon2Sync) {
      const salt = testCipher.random(16);
      const ours = await testCipher.argon2id(utf8('Été à Noël'), salt, { ops: 2, memKiB: 256 });
      const theirs = node.argon2Sync('argon2id', { message: Buffer.from(utf8('Été à Noël')), nonce: Buffer.from(salt), parallelism: 1, tagLength: 32, memory: 256, passes: 2 });
      expect(toHex(ours)).toBe(theirs.toString('hex'));
    }
  });
});

/** Argon2id v1.3, one lane, 3 passes, 64 KiB, 32 bytes, of « correct horse battery staple » salted « unlease-wallet!! ». */
const ARGON2ID_VECTOR = 'd2203acacbb1705a000c3572e2a75b2f1546172dca5b5d843f3d1c863ca8d56a';

describe('sealing', () => {
  const key = testCipher.random(32);

  it('opens what it sealed, in its place only', () => {
    const place = fieldPlace('walletItem', 'a', 'title');
    const sealed = sealValue(testCipher, key, { number: '12 AB 34567' }, place);
    expect(isSealed(sealed, 100)).toBe(true);
    expect(openValue(testCipher, key, sealed, place)).toEqual({ number: '12 AB 34567' });
    expect(openValue(testCipher, key, sealed, fieldPlace('walletItem', 'a', 'notes'))).toBeUndefined();
    expect(openValue(testCipher, key, sealed, fieldPlace('walletItem', 'b', 'title'))).toBeUndefined();
    expect(openValue(testCipher, testCipher.random(32), sealed, place)).toBeUndefined();
  });

  it('refuses a seal altered by one character', () => {
    const place = fieldPlace('walletItem', 'a', 'title');
    const sealed = sealBytes(testCipher, key, utf8('Passeport'), place);
    const at = sealed.length - 5;
    const altered = sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1);
    expect(openBytes(testCipher, key, altered, place)).toBeNull();
    expect(openBytes(testCipher, key, 'w1.', place)).toBeNull();
    expect(openBytes(testCipher, key, 42, place)).toBeNull();
  });

  it('says how long a seal is, so a record type can check it', () => {
    for (const size of [0, 1, 31, 32, 1000]) {
      const sealed = sealBytes(testCipher, key, new Uint8Array(size), 'x');
      expect(sealed.length).toBeLessThanOrEqual(sealedLength(size));
      expect(isSealed(sealed, size)).toBe(true);
    }
    expect(isSealed(sealBytes(testCipher, key, new Uint8Array(40), 'x'), 10)).toBe(false);
  });

  it('seals a file whole, bound to its blob', () => {
    const bytes = testCipher.random(5000);
    const sealed = sealBlob(testCipher, key, 'blob-1', bytes);
    expect(fromUtf8(sealed.slice(0, 4))).toBe('UWB1');
    expect(toHex(openBlob(testCipher, key, 'blob-1', sealed)!)).toBe(toHex(bytes));
    expect(openBlob(testCipher, key, 'blob-2', sealed)).toBeNull();
    expect(openBlob(testCipher, key, 'blob-1', sealed.slice(1))).toBeNull();
  });
});

describe('the vault', () => {
  it('opens with its passphrase or its recovery code, and with nothing else', async () => {
    const vault = await createVault(testCipher, '  Le chat dort sur la valise  ', 1000, TEST_KDF);
    expect(vault.recoveryCode).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const opened = await openWithPassphrase(testCipher, vault.fields, 'Le chat dort sur la valise');
    expect(toHex(opened!.papers)).toBe(toHex(vault.keys.papers));
    expect(toHex(opened!.cards)).toBe(toHex(vault.keys.cards));
    expect(await openWithPassphrase(testCipher, vault.fields, 'le chat dort sur la valise')).toBeNull();
    const recovered = await openWithRecovery(testCipher, vault.fields, vault.recoveryCode.toLowerCase().replace(/-/g, ' '));
    expect(toHex(recovered!.master)).toBe(toHex(vault.keys.master));
    expect(await openWithRecovery(testCipher, vault.fields, formatRecoveryCode(new Uint8Array(20)))).toBeNull();
    expect(await openWithRecovery(testCipher, vault.fields, 'not a code')).toBeNull();
  });

  it('takes a passphrase typed in either Unicode form', async () => {
    const vault = await createVault(testCipher, 'Été à Noël', 1000, TEST_KDF);
    expect(await openWithPassphrase(testCipher, vault.fields, 'Été à Noël'.normalize('NFD'))).not.toBeNull();
  });

  it('changes its passphrase and its recovery code without sealing anything else again', async () => {
    const vault = await createVault(testCipher, 'first one', 1000, TEST_KDF);
    const passphrase = await passphraseField(testCipher, vault.keys.master, 'second one', TEST_KDF);
    const recovery = await newRecovery(testCipher, vault.keys.master);
    const fields = { ...vault.fields, passphrase, recovery: recovery.field };
    expect(await openWithPassphrase(testCipher, fields, 'first one')).toBeNull();
    expect(toHex((await openWithPassphrase(testCipher, fields, 'second one'))!.papers)).toBe(toHex(vault.keys.papers));
    expect(await openWithRecovery(testCipher, fields, vault.recoveryCode)).toBeNull();
    expect(await openWithRecovery(testCipher, fields, recovery.code)).not.toBeNull();
    expect(readRecoveryCode(recovery.code)).toHaveLength(20);
  });

  it('refuses a vault that asks too much of a device', async () => {
    const vault = await createVault(testCipher, 'x', 1000, TEST_KDF);
    const greedy = JSON.stringify({ ...JSON.parse(vault.fields.passphrase), mem: 4 * 1024 * 1024 });
    expect(await openWithPassphrase(testCipher, { ...vault.fields, passphrase: greedy }, 'x')).toBeNull();
  });

  it('seals an item’s key under its tier, for that item only', () => {
    const tier = testCipher.random(32);
    const itemKey = testCipher.random(32);
    const sealed = sealItemKey(testCipher, tier, 'item-1', itemKey);
    expect(toHex(openItemKey(testCipher, tier, 'item-1', sealed)!)).toBe(toHex(itemKey));
    expect(openItemKey(testCipher, tier, 'item-2', sealed)).toBeNull();
  });
});
