package com.stephenprn.pages.intake

import android.content.Intent
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.stephenprn.unlease.specs.NativeIntakeSpec
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

/** As JavaScript receives it: the words shared, and the title the sending app gave them (a page's, a mail's subject). */
data class Share(val id: String, val text: String, val subject: String)

/**
 * Pages' side of the Intake spec (`mobile/shared/specs/NativeIntake.ts`): text or a link shared to the
 * app (« Ajouter à Pages ») is parked in [pending] until JavaScript takes it, and also emitted as
 * `onShare` while the module is alive (JavaScript dedupes by id); it becomes a new page
 * (src/app/intake.ts). Text only: no pictures or files.
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

  override fun setKeepScreenOn(on: Boolean) {
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

    fun receive(intent: Intent?) {
      if (intent?.action != Intent.ACTION_SEND) return
      if (!(intent.type ?: "").startsWith("text/")) return
      val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: ""
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
      if (text.isBlank() && subject.isBlank()) return
      val share = Share(UUID.randomUUID().toString(), text, subject)
      pending.set(share)
      live?.get()?.deliver(share)
    }

    private fun toMap(share: Share?): WritableMap =
        Arguments.createMap().apply {
          putString("id", share?.id ?: "")
          putString("text", share?.text ?: "")
          putString("subject", share?.subject ?: "")
          putString("mimeType", if (share == null) "" else "text/plain")
          putArray("files", Arguments.createArray())
        }
  }
}
