package com.stephenprn.wallet.vault

import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter

/**
 * XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha): HChaCha20 makes a subkey from the key and the
 * nonce's first 16 bytes, then ChaCha20-Poly1305 (IETF) runs under it with four zero bytes and the
 * nonce's last 8. The same bytes as `@noble/ciphers` on the web (`@unlease/wallet/crypto/cipher`).
 */
object XChaCha {
  const val KEY_BYTES = 32
  const val NONCE_BYTES = 24
  const val TAG_BYTES = 16

  private fun rotl(v: Int, c: Int): Int = (v shl c) or (v ushr (32 - c))

  private fun quarter(s: IntArray, a: Int, b: Int, c: Int, d: Int) {
    s[a] += s[b]; s[d] = rotl(s[d] xor s[a], 16)
    s[c] += s[d]; s[b] = rotl(s[b] xor s[c], 12)
    s[a] += s[b]; s[d] = rotl(s[d] xor s[a], 8)
    s[c] += s[d]; s[b] = rotl(s[b] xor s[c], 7)
  }

  private fun le(bytes: ByteArray, at: Int): Int =
    (bytes[at].toInt() and 255) or ((bytes[at + 1].toInt() and 255) shl 8) or ((bytes[at + 2].toInt() and 255) shl 16) or ((bytes[at + 3].toInt() and 255) shl 24)

  /** HChaCha20: 32 bytes from a key and 16 bytes of nonce. */
  fun hchacha20(key: ByteArray, nonce16: ByteArray): ByteArray {
    val s = IntArray(16)
    s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574
    for (i in 0 until 8) s[4 + i] = le(key, i * 4)
    for (i in 0 until 4) s[12 + i] = le(nonce16, i * 4)
    repeat(10) {
      quarter(s, 0, 4, 8, 12); quarter(s, 1, 5, 9, 13); quarter(s, 2, 6, 10, 14); quarter(s, 3, 7, 11, 15)
      quarter(s, 0, 5, 10, 15); quarter(s, 1, 6, 11, 12); quarter(s, 2, 7, 8, 13); quarter(s, 3, 4, 9, 14)
    }
    val out = ByteArray(32)
    val words = intArrayOf(s[0], s[1], s[2], s[3], s[12], s[13], s[14], s[15])
    for (i in words.indices) for (b in 0 until 4) out[i * 4 + b] = (words[i] ushr (8 * b)).toByte()
    return out
  }

  private fun run(encrypt: Boolean, key: ByteArray, nonce: ByteArray, input: ByteArray, ad: ByteArray): ByteArray {
    require(key.size == KEY_BYTES && nonce.size == NONCE_BYTES)
    val subkey = hchacha20(key, nonce.copyOfRange(0, 16))
    val inner = ByteArray(12).also { System.arraycopy(nonce, 16, it, 4, 8) }
    val aead = ChaCha20Poly1305()
    aead.init(encrypt, AEADParameters(KeyParameter(subkey), TAG_BYTES * 8, inner, ad))
    val out = ByteArray(aead.getOutputSize(input.size))
    val written = aead.processBytes(input, 0, input.size, out, 0)
    aead.doFinal(out, written)
    subkey.fill(0)
    return out
  }

  /** The ciphertext with its tag appended. */
  fun seal(key: ByteArray, nonce: ByteArray, plain: ByteArray, ad: ByteArray): ByteArray = run(true, key, nonce, plain, ad)

  /** The plain bytes, or null when the tag does not hold. */
  fun open(key: ByteArray, nonce: ByteArray, sealed: ByteArray, ad: ByteArray): ByteArray? =
    try {
      run(false, key, nonce, sealed, ad)
    } catch (_: Exception) {
      null
    }
}
