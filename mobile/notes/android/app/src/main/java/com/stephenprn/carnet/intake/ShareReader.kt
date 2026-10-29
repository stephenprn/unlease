package com.stephenprn.carnet.intake

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.stephenprn.carnet.media.ImageImporter
import java.util.UUID

/** As JavaScript receives it: images already copied into app storage. */
data class Share(val id: String, val text: String, val subject: String, val files: List<String>, val mimeType: String)

/** As the intent carried it: content URIs, readable only while the grant lasts. */
data class RawShare(val text: String, val subject: String, val uris: List<Uri>, val mimeType: String)

object ShareReader {

  fun parse(intent: Intent?): RawShare? {
    if (intent == null) return null
    val type = intent.type ?: ""
    return when (intent.action) {
      Intent.ACTION_SEND -> {
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: ""
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
        val stream = streamExtra(intent)
        val uris = if (stream != null && type.startsWith("image/")) listOf(stream) else emptyList()
        if (text.isBlank() && subject.isBlank() && uris.isEmpty()) null else RawShare(text, subject, uris, type)
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        val uris = streamListExtra(intent).filter { type.startsWith("image/") }
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: ""
        if (uris.isEmpty() && text.isBlank()) null else RawShare(text, intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: "", uris, type)
      }
      else -> null
    }
  }

  /** Imports the images while the grant holds, like a picked photo; a failed one is skipped. */
  fun materialize(context: Context, raw: RawShare): Share {
    val files =
        raw.uris.mapNotNull { uri ->
          try {
            ImageImporter.import(context, uri)?.path
          } catch (_: Exception) {
            null
          }
        }
    return Share(UUID.randomUUID().toString(), raw.text, raw.subject, files, raw.mimeType)
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? =
      if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri> =
      (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
      else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()
}
