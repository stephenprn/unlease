/** The cipher the web app and the server's tools hand in (`@noble/ciphers`, `hash-wasm`), for the package's tests. */
import { webcrypto } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2id } from 'hash-wasm';
import type { KdfParams, WalletCipher } from '../cipher';

export const testCipher: WalletCipher = {
  random: length => webcrypto.getRandomValues(new Uint8Array(length)),
  seal: (key, nonce, plain, ad) => xchacha20poly1305(key, nonce, ad).encrypt(plain),
  open: (key, nonce, sealed, ad) => {
    try {
      return xchacha20poly1305(key, nonce, ad).decrypt(sealed);
    } catch {
      return null;
    }
  },
  argon2id: (password: Uint8Array, salt: Uint8Array, params: KdfParams) =>
    argon2id({ password, salt, parallelism: 1, iterations: params.ops, memorySize: params.memKiB, hashLength: 32, outputType: 'binary' }),
};

/** A cheap cost for tests: the vault's own would spend 64 MiB a derivation. */
export const TEST_KDF: KdfParams = { ops: 1, memKiB: 64 };
