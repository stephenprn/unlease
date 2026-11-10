package com.stephenprn.agenda.intake

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.stephenprn.unlease.specs.NativeIntakeSpec
import java.io.File
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/** As JavaScript receives it: the files already copied into the app's cache (the grant lapses). */
data class Share(val id: String, val subject: String, val files: List<String>, val mimeType: String)

/**
 * Agenda's side of the Intake spec (`mobile/shared/specs/NativeIntake.ts`): a calendar file (`.ics`)
 * shared to the app or opened with it (an invitation from a mail app, a ticket, Google's export, a
 * file manager's « Ouvrir avec ») is copied into the cache and parked in [pending] until JavaScript
 * takes it, and also emitted as `onShare` while the module is alive (JavaScript dedupes by id). A
 * calendar sent as text (`BEGIN:VCALENDAR…` in EXTRA_TEXT) is written to a file the same way.
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
    /** The types a calendar comes as; a file manager may say only octet-stream for an `.ics`. */
    private val CARD_TYPES = setOf("text/calendar", "text/x-vcalendar", "application/ics")
    /** A calendar file larger than this is no calendar a phone shares. */
    private const val MAX_BYTES = 20L * 1024 * 1024

    private val pending = AtomicReference<Share?>(null)
    @Volatile private var live: WeakReference<IntakeModule>? = null
    private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "intake-io").apply { isDaemon = true } }

    fun receive(context: Context, intent: Intent?) {
      if (intent == null) return
      val type = (intent.type ?: "").lowercase()
      val uris: List<Uri>
      var text = ""
      when (intent.action) {
        Intent.ACTION_SEND -> {
          uris = listOfNotNull(streamExtra(intent))
          text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: ""
        }
        Intent.ACTION_SEND_MULTIPLE -> uris = streamListExtra(intent)
        Intent.ACTION_VIEW -> uris = listOfNotNull(intent.data?.takeIf { it.scheme == "content" || it.scheme == "file" })
        else -> return
      }
      val card = type in CARD_TYPES || uris.any { (it.lastPathSegment ?: "").lowercase().endsWith(".ics") } || text.trimStart().startsWith("BEGIN:VCALENDAR", ignoreCase = true)
      if (!card || (uris.isEmpty() && text.isBlank())) return
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
      val appContext = context.applicationContext
      io.execute {
        val dir = File(appContext.cacheDir, "shared-in").apply { mkdirs() }
        val files = mutableListOf<String>()
        for (uri in uris) {
          try {
            val target = File(dir, "${UUID.randomUUID()}.ics")
            appContext.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { out -> copyBounded(input, out) } }
            if (target.length() > 0) files += target.absolutePath else target.delete()
          } catch (_: Exception) {
            // An unreadable file is skipped; the others still come.
          }
        }
        if (files.isEmpty() && text.isNotBlank()) {
          val target = File(dir, "${UUID.randomUUID()}.ics")
          target.writeText(text)
          files += target.absolutePath
        }
        if (files.isEmpty()) return@execute
        val share = Share(UUID.randomUUID().toString(), subject, files, type.ifEmpty { "text/calendar" })
        pending.set(share)
        live?.get()?.deliver(share)
      }
    }

    private fun copyBounded(input: java.io.InputStream, out: java.io.OutputStream) {
      val buffer = ByteArray(64 * 1024)
      var total = 0L
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        total += read
        if (total > MAX_BYTES) throw IllegalStateException("calendar too large")
        out.write(buffer, 0, read)
      }
    }

    @Suppress("DEPRECATION")
    private fun streamExtra(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun streamListExtra(intent: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()

    private fun toMap(share: Share?): WritableMap =
        Arguments.createMap().apply {
          putString("id", share?.id ?: "")
          putString("text", "")
          putString("subject", share?.subject ?: "")
          putString("mimeType", share?.mimeType ?: "")
          putArray("files", Arguments.createArray().apply { share?.files?.forEach { pushString(it) } })
        }
  }
}
