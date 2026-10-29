package com.stephenprn.carnet.intake

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.stephenprn.carnet.specs.NativeIntakeSpec
import java.lang.ref.WeakReference
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * Shares, the clipboard and the keep-screen-on flag. A share is parked in [pending] until
 * JavaScript takes it, and also emitted as `onShare` when the module is alive: JavaScript dedupes by id.
 */
class IntakeModule(private val reactContext: ReactApplicationContext) : NativeIntakeSpec(reactContext) {

  init {
    live = WeakReference(this)
  }

  override fun invalidate() {
    if (live?.get() === this) live = null
    super.invalidate()
  }

  override fun takePendingShare(promise: Promise) {
    promise.resolve(toMap(pending.getAndSet(null)))
  }

  override fun readClipboardText(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve("")
      return
    }
    // Android only lets the focused app read the clipboard, from its UI thread.
    activity.runOnUiThread {
      val text =
          try {
            val clipboard = reactContext.getSystemService(ClipboardManager::class.java)
            clipboard?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(reactContext)?.toString() ?: ""
          } catch (_: SecurityException) {
            ""
          }
      promise.resolve(text)
    }
  }

  override fun writeClipboardText(text: String, promise: Promise) {
    val write = {
      val copied =
          try {
            val clipboard = reactContext.getSystemService(ClipboardManager::class.java)
            clipboard?.setPrimaryClip(ClipData.newPlainText("text", text))
            clipboard != null
          } catch (_: SecurityException) {
            false
          }
      promise.resolve(copied)
    }
    val activity = reactContext.currentActivity
    if (activity != null) activity.runOnUiThread { write() } else write()
  }

  override fun setKeepScreenOn(on: Boolean) {
    // A window flag: it holds only while the window shows, so the app sent away lets the screen sleep anyway.
    UiThreadUtil.runOnUiThread {
      val window = reactContext.currentActivity?.window ?: return@runOnUiThread
      if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  private fun deliver(share: Share) {
    emitOnShare(toMap(share))
  }

  companion object {
    private val pending = AtomicReference<Share?>(null)
    @Volatile private var live: WeakReference<IntakeModule>? = null
    private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "intake-io").apply { isDaemon = true } }

    fun receive(context: Context, intent: Intent?) {
      val raw = ShareReader.parse(intent) ?: return
      val appContext = context.applicationContext
      io.execute {
        val share = ShareReader.materialize(appContext, raw)
        pending.set(share)
        live?.get()?.deliver(share)
      }
    }

    private fun toMap(share: Share?): WritableMap =
        Arguments.createMap().apply {
          putString("id", share?.id ?: "")
          putString("text", share?.text ?: "")
          putString("subject", share?.subject ?: "")
          putString("mimeType", share?.mimeType ?: "")
          putArray("files", Arguments.createArray().apply { share?.files?.forEach { pushString(it) } })
        }
  }
}
