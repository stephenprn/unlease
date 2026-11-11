package com.stephenprn.contacts.intake

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
import com.stephenprn.unlease.launch.IntentExtras
import com.stephenprn.unlease.specs.NativeIntakeSpec
import java.io.File
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * As JavaScript receives it: the cards already copied into the app's cache (the grant lapses), or
 * another app's « Créer un contact » ([IntakeModule.INSERT], its extras as JSON in `text`).
 */
data class Share(val id: String, val subject: String, val files: List<String>, val mimeType: String, val text: String = "")

/**
 * Contacts' side of the Intake spec (`mobile/shared/specs/NativeIntake.ts`): a contact card (`.vcf`)
 * shared to the app (WhatsApp's « Partager le contact », Android's own contacts, a file manager's
 * « Ouvrir avec ») is copied into the cache and parked in [pending] until JavaScript takes it, and
 * also emitted as `onShare` while the module is alive (JavaScript dedupes by id). A card sent as
 * text (`BEGIN:VCARD…` in EXTRA_TEXT) is written to a file the same way. Another app's « Créer un
 * contact » or « Ajouter à un contact » (the dialer's, Messages', a mail app's: INSERT, INSERT_OR_EDIT)
 * is parked the same way, its extras as they came (`ContactsContract.Intents.Insert`), for the new
 * contact's form to open filled with them (`app/handedContact.ts`).
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
    /** The types a card comes as; a file manager may say only octet-stream for a `.vcf`. */
    private val CARD_TYPES = setOf("text/x-vcard", "text/vcard", "text/directory")
    /** A card larger than this is no address book a phone shares. */
    private const val MAX_BYTES = 20L * 1024 * 1024
    /** A share's `mimeType` when it is another app's new contact (`platform/intake.ts`, HANDED_CONTACT). */
    const val INSERT = "x-unlease/contact-insert"

    private val pending = AtomicReference<Share?>(null)
    @Volatile private var live: WeakReference<IntakeModule>? = null
    private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "intake-io").apply { isDaemon = true } }

    fun receive(context: Context, intent: Intent?) {
      if (intent == null) return
      // Only a contact's types reach here with these (the manifest's filters): nothing is written until the form is saved.
      if (intent.action == Intent.ACTION_INSERT || intent.action == Intent.ACTION_INSERT_OR_EDIT) {
        park(Share(UUID.randomUUID().toString(), "", emptyList(), INSERT, IntentExtras.toJson(intent).toString()))
        return
      }
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
      val card = type in CARD_TYPES || uris.any { (it.lastPathSegment ?: "").lowercase().endsWith(".vcf") } || text.trimStart().startsWith("BEGIN:VCARD", ignoreCase = true)
      if (!card || (uris.isEmpty() && text.isBlank())) return
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
      val appContext = context.applicationContext
      io.execute {
        val dir = File(appContext.cacheDir, "shared-in").apply { mkdirs() }
        val files = mutableListOf<String>()
        for (uri in uris) {
          try {
            val target = File(dir, "${UUID.randomUUID()}.vcf")
            appContext.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { out -> copyBounded(input, out) } }
            if (target.length() > 0) files += target.absolutePath else target.delete()
          } catch (_: Exception) {
            // An unreadable card is skipped; the others still come.
          }
        }
        if (files.isEmpty() && text.isNotBlank()) {
          val target = File(dir, "${UUID.randomUUID()}.vcf")
          target.writeText(text)
          files += target.absolutePath
        }
        if (files.isEmpty()) return@execute
        park(Share(UUID.randomUUID().toString(), subject, files, type.ifEmpty { "text/x-vcard" }))
      }
    }

    /** Kept until JavaScript takes it (after the first run, if the app is not set up yet), and sent at once to a live module. */
    private fun park(share: Share) {
      pending.set(share)
      live?.get()?.deliver(share)
    }

    private fun copyBounded(input: java.io.InputStream, out: java.io.OutputStream) {
      val buffer = ByteArray(64 * 1024)
      var total = 0L
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        total += read
        if (total > MAX_BYTES) throw IllegalStateException("card too large")
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
          putString("text", share?.text ?: "")
          putString("subject", share?.subject ?: "")
          putString("mimeType", share?.mimeType ?: "")
          putArray("files", Arguments.createArray().apply { share?.files?.forEach { pushString(it) } })
        }
  }
}
