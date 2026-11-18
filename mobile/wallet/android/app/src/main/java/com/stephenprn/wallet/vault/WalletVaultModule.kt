package com.stephenprn.wallet.vault

import android.os.Build
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
import com.stephenprn.unlease.specs.NativeWalletVaultSpec
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.Executors
import javax.crypto.Cipher
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters

/** Wallet's vault, as JavaScript reaches it (`specs/NativeWalletVault.ts`). */
class WalletVaultModule(private val context: ReactApplicationContext) : NativeWalletVaultSpec(context) {
  private val random = SecureRandom()
  private val worker = Executors.newSingleThreadExecutor()

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }

  private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  private fun decode(text: String): ByteArray = Base64.decode(text, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

  override fun randomBytes(length: Double): String = encode(ByteArray(length.toInt()).also { random.nextBytes(it) })

  override fun argon2id(password: String, salt: String, ops: Double, memKiB: Double, promise: Promise) {
    worker.execute {
      try {
        val params =
          Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withIterations(ops.toInt())
            .withMemoryAsKB(memKiB.toInt())
            .withParallelism(1)
            .withSalt(decode(salt))
            .build()
        val generator = Argon2BytesGenerator().apply { init(params) }
        val secret = decode(password)
        val out = ByteArray(32)
        generator.generateBytes(secret, out)
        secret.fill(0)
        promise.resolve(encode(out))
        out.fill(0)
      } catch (error: Throwable) {
        promise.reject("argon2", error.message ?: "argon2id failed", error)
      }
    }
  }

  private val magic = byteArrayOf(0x55, 0x57, 0x42, 0x31)
  private fun place(blobId: String) = "unlease/wallet/1/blob/$blobId".toByteArray(Charsets.UTF_8)

  override fun sealFile(key: String, blobId: String, input: String, output: String, promise: Promise) {
    worker.execute {
      try {
        val plain = File(input).readBytes()
        val nonce = ByteArray(XChaCha.NONCE_BYTES).also { random.nextBytes(it) }
        val k = decode(key)
        val sealed = XChaCha.seal(k, nonce, plain, place(blobId))
        k.fill(0)
        plain.fill(0)
        val target = File(output)
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, "${target.name}.part")
        temp.outputStream().use { stream ->
          stream.write(magic)
          stream.write(nonce)
          stream.write(sealed)
          stream.fd.sync()
        }
        if (!temp.renameTo(target)) throw IllegalStateException("rename failed")
        promise.resolve(target.length().toDouble())
      } catch (error: Throwable) {
        promise.reject("seal", error.message ?: "seal failed", error)
      }
    }
  }

  override fun openFile(key: String, blobId: String, input: String, output: String, promise: Promise) {
    worker.execute {
      try {
        val bytes = File(input).readBytes()
        val head = magic.size
        if (bytes.size < head + XChaCha.NONCE_BYTES + XChaCha.TAG_BYTES || !bytes.copyOfRange(0, head).contentEquals(magic)) {
          promise.resolve(false)
          return@execute
        }
        val k = decode(key)
        val plain = XChaCha.open(k, bytes.copyOfRange(head, head + XChaCha.NONCE_BYTES), bytes.copyOfRange(head + XChaCha.NONCE_BYTES, bytes.size), place(blobId))
        k.fill(0)
        if (plain == null) {
          promise.resolve(false)
          return@execute
        }
        val target = File(output)
        target.parentFile?.mkdirs()
        target.writeBytes(plain)
        plain.fill(0)
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("open", error.message ?: "open failed", error)
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

  override fun hasTierKey(tier: String): Boolean = TierKeys.has(context, tier)

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

  override fun storeTierKey(tier: String, key: String, title: String, subtitle: String, promise: Promise) {
    try {
      TierKeys.forget(context, tier)
      val cipher = TierKeys.encrypter(tier)
      val bytes = decode(key)
      if (tier != "papers") {
        TierKeys.keep(context, tier, cipher, bytes)
        bytes.fill(0)
        promise.resolve(true)
        return
      }
      prompt(cipher, title, subtitle) { unlocked ->
        try {
          if (unlocked == null) {
            TierKeys.forget(context, tier)
            promise.resolve(false)
          } else {
            TierKeys.keep(context, tier, unlocked, bytes)
            promise.resolve(true)
          }
        } catch (error: Throwable) {
          TierKeys.forget(context, tier)
          promise.reject("store", error.message ?: "store failed", error)
        } finally {
          bytes.fill(0)
        }
      }
    } catch (error: Throwable) {
      promise.reject("store", error.message ?: "store failed", error)
    }
  }

  override fun loadTierKey(tier: String, title: String, subtitle: String, promise: Promise) {
    val cipher =
      try {
        TierKeys.decrypter(context, tier)
      } catch (error: Throwable) {
        if (TierKeys.isInvalidated(error)) {
          TierKeys.forget(context, tier)
          promise.resolve("invalidated")
        } else promise.reject("load", error.message ?: "load failed", error)
        return
      } ?: return promise.resolve("")
    val finish: (Cipher?) -> Unit = { unlocked ->
      try {
        val key = unlocked?.let { TierKeys.read(context, it, tier) }
        promise.resolve(key?.let { encode(it).also { _ -> it.fill(0) } } ?: "")
      } catch (error: Throwable) {
        promise.reject("load", error.message ?: "load failed", error)
      }
    }
    if (tier == "papers") prompt(cipher, title, subtitle, finish) else finish(cipher)
  }

  override fun forgetTierKey(tier: String) = TierKeys.forget(context, tier)

  override fun sealedDir(): String = File(context.filesDir, "wallet").apply { mkdirs() }.absolutePath

  override fun openedDir(): String = File(context.cacheDir, "wallet-open").apply { mkdirs() }.absolutePath

  override fun wipeOpened() {
    File(context.cacheDir, "wallet-open").listFiles()?.forEach { it.deleteRecursively() }
  }

  override fun viewFile(path: String, mime: String): Boolean {
    val file = File(path)
    // Only what was opened for viewing goes to another app, never the sealed files.
    if (!file.canonicalPath.startsWith(File(context.cacheDir, "wallet-open").canonicalPath + File.separator) || !file.exists()) return false
    return try {
      val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.files", file)
      val intent = android.content.Intent(android.content.Intent.ACTION_VIEW)
        .setDataAndType(uri, mime)
        .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  override fun download(url: String, token: String, output: String, promise: Promise) {
    worker.execute {
      try {
        val connection = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
          setRequestProperty("Authorization", "Bearer $token")
          connectTimeout = 20_000
          readTimeout = 60_000
          instanceFollowRedirects = false
        }
        try {
          if (connection.responseCode != 200) {
            promise.resolve(false)
            return@execute
          }
          val target = File(output)
          target.parentFile?.mkdirs()
          val temp = File(target.parentFile, "${target.name}.part")
          connection.inputStream.use { input -> temp.outputStream().use { input.copyTo(it) } }
          if (!temp.renameTo(target)) throw IllegalStateException("rename failed")
          promise.resolve(true)
        } finally {
          connection.disconnect()
        }
      } catch (error: Throwable) {
        promise.resolve(false)
      }
    }
  }

  override fun copySecret(text: String): Boolean =
    try {
      val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
      val clip = android.content.ClipData.newPlainText("", text)
      clip.description.extras = android.os.PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
      clipboard.setPrimaryClip(clip)
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
        try {
          if (clipboard.primaryClip?.getItemAt(0)?.text?.toString() == text) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) clipboard.clearPrimaryClip() else clipboard.setPrimaryClip(android.content.ClipData.newPlainText("", ""))
          }
        } catch (_: Exception) {
          // The clipboard is no longer ours to read: leave it.
        }
      }, 60_000)
      true
    } catch (_: Exception) {
      false
    }

  /**
   * A dev build (`.dev`) only, for testing on a phone: `adb shell settings put global
   * unlease_dev_captures 1` lets its papers be captured. A released app never reads it.
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

  override fun setTill(on: Boolean) {
    val activity = context.currentActivity ?: return
    UiThreadUtil.runOnUiThread {
      val window = activity.window
      window.attributes = window.attributes.apply { screenBrightness = if (on) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE }
      if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

}
