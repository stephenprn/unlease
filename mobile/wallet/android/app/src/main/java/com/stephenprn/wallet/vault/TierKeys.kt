package com.stephenprn.wallet.vault

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The tier keys this phone keeps, each sealed (AES-GCM) by a key of its own in the Android Keystore,
 * which never leaves the secure hardware: `cards` usable at once (so cards reach the till without a
 * prompt, as a widget would need), `papers` only through a CryptoObject the fingerprint or the screen
 * lock unlocks, for that one operation; a new fingerprint enrolled invalidates it, and the passphrase
 * is asked again. What is sealed sits in this app's private preferences (never backed up:
 * `allowBackup` is false).
 */
object TierKeys {
  private const val STORE = "AndroidKeyStore"
  private const val PREFS = "wallet.tierKeys"
  private fun alias(tier: String) = "wallet.tier.$tier"
  private fun guarded(tier: String) = tier == "papers"

  private fun keyStore(): KeyStore = KeyStore.getInstance(STORE).apply { load(null) }

  private fun secretKey(tier: String, create: Boolean): SecretKey? {
    val store = keyStore()
    (store.getKey(alias(tier), null) as? SecretKey)?.let { return it }
    if (!create) return null
    val builder =
      KeyGenParameterSpec.Builder(alias(tier), KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
    if (guarded(tier)) {
      builder.setUserAuthenticationRequired(true)
      builder.setInvalidatedByBiometricEnrollment(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Each use asks: the fingerprint, or the screen lock.
        builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      // StrongBox where the phone has a secure element; else the TEE.
      try {
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE).apply { init(builder.setIsStrongBoxBacked(true).build()) }.generateKey()
      } catch (_: Exception) {
        builder.setIsStrongBoxBacked(false)
      }
    }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE).apply { init(builder.build()) }.generateKey()
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun has(context: Context, tier: String): Boolean = prefs(context).contains("$tier.sealed") && secretKey(tier, false) != null

  /** A cipher ready to seal a tier's key (the fingerprint unlocks it first for papers). */
  fun encrypter(tier: String): Cipher {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey(tier, true))
    return cipher
  }

  /** A cipher ready to open it; null when nothing is kept. Throws KeyPermanentlyInvalidatedException after a new fingerprint. */
  fun decrypter(context: Context, tier: String): Cipher? {
    val iv = prefs(context).getString("$tier.iv", null) ?: return null
    val key = secretKey(tier, false) ?: return null
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
    return cipher
  }

  fun keep(context: Context, tier: String, cipher: Cipher, key: ByteArray) {
    val sealed = cipher.doFinal(key)
    prefs(context).edit().putString("$tier.sealed", Base64.encodeToString(sealed, Base64.NO_WRAP)).putString("$tier.iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).apply()
  }

  fun read(context: Context, cipher: Cipher, tier: String): ByteArray? {
    val sealed = prefs(context).getString("$tier.sealed", null) ?: return null
    return cipher.doFinal(Base64.decode(sealed, Base64.NO_WRAP))
  }

  fun forget(context: Context, tier: String) {
    prefs(context).edit().remove("$tier.sealed").remove("$tier.iv").apply()
    try {
      keyStore().deleteEntry(alias(tier))
    } catch (_: Exception) {
      // Already gone.
    }
  }

  fun isInvalidated(error: Throwable): Boolean = error is KeyPermanentlyInvalidatedException || error.cause is KeyPermanentlyInvalidatedException
}
