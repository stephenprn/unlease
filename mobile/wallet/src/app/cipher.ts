/**
 * The wallet's cryptography on the phone (`@unlease/wallet/crypto/cipher`): XChaCha20-Poly1305 in
 * JavaScript (`@noble/ciphers`, as the web: a field is a few hundred bytes), randomness and Argon2id
 * from the native vault (Android's SecureRandom; Bouncy Castle, off the main thread). Files are sealed
 * natively, file to file (`./files`), never through the bridge.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import { fromBase64Url, toBase64Url } from '@unlease/wallet/crypto/bytes';
import type { KdfParams, WalletCipher } from '@unlease/wallet/crypto/cipher';
import { vaultNative } from '@platform/vault';

export const phoneCipher: WalletCipher = {
  random: length => fromBase64Url(vaultNative.randomBytes(length)) ?? new Uint8Array(length),
  seal: (key, nonce, plain, ad) => xchacha20poly1305(key, nonce, ad).encrypt(plain),
  open: (key, nonce, sealed, ad) => {
    try {
      return xchacha20poly1305(key, nonce, ad).decrypt(sealed);
    } catch {
      return null;
    }
  },
  argon2id: async (password: Uint8Array, salt: Uint8Array, params: KdfParams) => {
    const key = fromBase64Url(await vaultNative.argon2id(toBase64Url(password), toBase64Url(salt), params.ops, params.memKiB));
    if (!key || key.length !== 32) throw new Error('argon2id');
    return key;
  },
};
