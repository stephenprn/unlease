/**
 * The wallet's cryptography in a browser (`@unlease/wallet/crypto/cipher`): XChaCha20-Poly1305 from
 * `@noble/ciphers` (audited, no dependency), Argon2id from `hash-wasm` (WebAssembly, inlined in the
 * bundle: nothing is fetched), randomness from the browser's own generator. The same bytes as the
 * phone's and the server's tools for the same inputs (`crypto/__tests__`).
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2id } from 'hash-wasm';

import type { KdfParams, WalletCipher } from '@unlease/wallet/crypto/cipher';

export const browserCipher: WalletCipher = {
  random: length => crypto.getRandomValues(new Uint8Array(length)),
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
