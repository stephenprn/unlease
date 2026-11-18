package com.stephenprn.unlease.lock

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.stephenprn.unlease.specs.NativeSuiteLockSpec
import java.security.KeyStore
import java.security.SecureRandom
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec

/**
 * The suite's lock, as JavaScript reaches it (`specs/NativeSuiteLock.ts`). The stamp (the password's
 * check, as it was when the password was typed here) is sealed by AES-GCM under a Keystore key that
 * only the fingerprint or the screen lock unlocks, for one operation; it sits in this app's private
 * preferences (never backed up).
 */
class SuiteLockModule(private val context: ReactApplicationContext) : NativeSuiteLockSpec(context) {
  private val random = SecureRandom()
  private val worker = Executors.newSingleThreadExecutor()

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }

  private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  private fun decode(text: String): ByteArray = Base64.decode(text, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

  override fun randomBytes(length: Double): String = encode(ByteArray(length.toInt()).also { random.nextBytes(it) })

  override fun pbkdf2(secret: String, salt: String, iterations: Double, promise: Promise) {
    worker.execute {
      try {
        // `secret` is ASCII (`core/services/lock`'s `lockSecret`): characters and bytes are the same.
        val chars = secret.toCharArray()
        val spec = PBEKeySpec(chars, decode(salt), iterations.toInt(), 256)
        val out = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        spec.clearPassword()
        chars.fill('\u0000')
        promise.resolve(encode(out))
        out.fill(0)
      } catch (error: Throwable) {
        promise.reject("pbkdf2", error.message ?: "pbkdf2 failed", error)
      }
    }
  }

  private fun authenticators(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_STRONG

  override fun biometrics(): String =
    when (BiometricManager.from(context).canAuthenticate(authenticators())) {
      BiometricManager.BIOMETRIC_SUCCESS -> "ready"
      BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none"
      else -> "unavailable"
    }

  // ── the stamp, behind the fingerprint ──────────────────────────────────

  private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun keyStore(): KeyStore = KeyStore.getInstance(STORE).apply { load(null) }

  private fun secretKey(create: Boolean): SecretKey? {
    (keyStore().getKey(ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    val builder =
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setUserAuthenticationRequired(true)
        .setInvalidatedByBiometricEnrollment(true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Each use asks: the fingerprint, or the screen lock.
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
    }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE).apply { init(builder.build()) }.generateKey()
  }

  override fun hasStamp(): Boolean = prefs().contains(SEALED) && secretKey(false) != null

  override fun forgetStamp() {
    prefs().edit().remove(SEALED).remove(IV).apply()
    try {
      keyStore().deleteEntry(ALIAS)
    } catch (_: Exception) {
      // Already gone.
    }
  }

  private fun isInvalidated(error: Throwable): Boolean = error is KeyPermanentlyInvalidatedException || error.cause is KeyPermanentlyInvalidatedException

  /** The fingerprint (or the screen lock) asked, unlocking `cipher` for one use. */
  private fun prompt(cipher: Cipher, title: String, subtitle: String, done: (Cipher?) -> Unit) {
    val activity = context.currentActivity as? FragmentActivity ?: return done(null)
    UiThreadUtil.runOnUiThread {
      val info =
        BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle).setAllowedAuthenticators(authenticators()).apply {
          if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) setNegativeButtonText(activity.getString(android.R.string.cancel))
        }.build()
      val callback =
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done(result.cryptoObject?.cipher)
          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = done(null)
        }
      BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback).authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
  }

  override fun keepStamp(stamp: String, title: String, subtitle: String, promise: Promise) {
    try {
      forgetStamp()
      val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey(true)) }
      prompt(cipher, title, subtitle) { unlocked ->
        try {
          if (unlocked == null) {
            forgetStamp()
            promise.resolve(false)
          } else {
            val sealed = unlocked.doFinal(stamp.toByteArray(Charsets.UTF_8))
            prefs().edit().putString(SEALED, encode(sealed)).putString(IV, encode(unlocked.iv)).apply()
            promise.resolve(true)
          }
        } catch (error: Throwable) {
          forgetStamp()
          promise.reject("keep", error.message ?: "keep failed", error)
        }
      }
    } catch (error: Throwable) {
      promise.reject("keep", error.message ?: "keep failed", error)
    }
  }

  override fun readStamp(title: String, subtitle: String, promise: Promise) {
    val sealed = prefs().getString(SEALED, null)
    val iv = prefs().getString(IV, null)
    if (sealed == null || iv == null) return promise.resolve("")
    val cipher =
      try {
        val key = secretKey(false) ?: return promise.resolve("")
        Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, decode(iv))) }
      } catch (error: Throwable) {
        if (isInvalidated(error)) {
          forgetStamp()
          promise.resolve("invalidated")
        } else promise.reject("read", error.message ?: "read failed", error)
        return
      }
    prompt(cipher, title, subtitle) { unlocked ->
      try {
        promise.resolve(unlocked?.doFinal(decode(sealed))?.toString(Charsets.UTF_8) ?: "")
      } catch (error: Throwable) {
        promise.reject("read", error.message ?: "read failed", error)
      }
    }
  }

  // ── the window ─────────────────────────────────────────────────────────

  /**
   * A dev build (`.dev`) only, for testing on a phone: `adb shell settings put global
   * unlease_dev_captures 1` lets what the lock guards be captured. A released app never reads it.
   */
  private fun devCaptures(): Boolean =
    context.packageName.endsWith(".dev") && android.provider.Settings.Global.getInt(context.contentResolver, "unlease_dev_captures", 0) == 1

  override fun setSecure(on: Boolean) {
    val activity = context.currentActivity ?: return
    val secure = on && !devCaptures()
    UiThreadUtil.runOnUiThread {
      if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  private companion object {
    const val STORE = "AndroidKeyStore"
    const val ALIAS = "unlease.lock.stamp"
    const val PREFS = "unlease.lock"
    const val SEALED = "stamp.sealed"
    const val IV = "stamp.iv"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
