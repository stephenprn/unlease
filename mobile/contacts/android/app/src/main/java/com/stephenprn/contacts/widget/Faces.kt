package com.stephenprn.contacts.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.text.TextPaint
import androidx.core.content.res.ResourcesCompat
import com.stephenprn.contacts.R
import com.stephenprn.unlease.organic.Squircle
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * Faces for « Appels rapides », as the app's `ContactAvatar` draws them: a photo cut square to the
 * frame's continuous corner (`Squircle`, RADII.frame), or initials in Signika, an alpha mask the
 * widget tints on the contact's pigment. A photo comes from this phone's copy when there is one, else
 * from the server's display copy, fetched with the device's token and kept in the cache; the widgets
 * draw again when one lands. Small pictures: a launcher takes a widget's pictures in one parcel.
 */
internal object Faces {
  /** The face as `widget_calls_cell.xml` shows it. */
  private const val SIDE_DP = 48f
  /** RADII.frame, on that side. */
  private const val RADIUS_DP = 12f
  /** No face larger than this, whatever the screen's density. */
  private const val MAX_PX = 120
  private const val KEEP = 200
  private const val MAX_BYTES = 12 * 1024 * 1024

  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "widget-faces").apply { isDaemon = true } }
  private val fetching = Collections.synchronizedSet(mutableSetOf<String>())
  /** Refused by the server (gone, not a picture): not asked again while the process lives. */
  private val refused = Collections.synchronizedSet(mutableSetOf<String>())

  private fun side(context: Context): Int = min(MAX_PX, (SIDE_DP * context.resources.displayMetrics.density).toInt())

  private fun dir(context: Context) = File(context.cacheDir, "widget-faces").apply { mkdirs() }

  private fun file(context: Context, id: String) = File(dir(context), "${id.filter { it.isLetterOrDigit() || it == '-' || it == '_' }}.png")

  /** The face for a photo: kept already, or cut now from this phone's copy (`local`); null until fetched. */
  fun photo(context: Context, id: String, local: String): Bitmap? {
    if (id.isEmpty()) return null
    val kept = file(context, id)
    if (kept.exists()) return BitmapFactory.decodeFile(kept.path)
    if (local.isEmpty() || !File(local).exists()) return null
    return try {
      val picture = decode(File(local).readBytes()) ?: return null
      val framed = frame(context, picture)
      kept.outputStream().use { framed.compress(Bitmap.CompressFormat.PNG, 100, it) }
      framed
    } catch (_: Exception) {
      null
    }
  }

  /** Fetches the photos not kept yet, then draws « Appels rapides » again. Without a server, nothing. */
  fun fetch(context: Context, ids: List<String>, server: JSONObject?) {
    val base = server?.optString("url").orEmpty().trimEnd('/')
    val token = server?.optString("token").orEmpty()
    if (base.isEmpty() || ids.isEmpty()) return
    val app = context.applicationContext
    val missing = ids.distinct().filter { it.isNotEmpty() && it !in refused && !file(app, it).exists() && fetching.add(it) }
    if (missing.isEmpty()) return
    io.execute {
      var landed = false
      for (id in missing) {
        try {
          val picture = download("$base/api/blobs/$id?variant=display", token)
          if (picture == null) {
            refused.add(id)
            continue
          }
          file(app, id).outputStream().use { frame(app, picture).compress(Bitmap.CompressFormat.PNG, 100, it) }
          landed = true
        } catch (_: Exception) {
          // Offline: the initials stay, and the next draw asks again.
        } finally {
          fetching.remove(id)
        }
      }
      if (landed) {
        prune(app)
        Widgets.redrawAll(app, CallsWidgetProvider::class.java)
      }
    }
  }

  /** The initials as an alpha mask the size of the face, centred, in Signika SemiBold. */
  fun initials(context: Context, text: String): Bitmap? {
    if (text.isEmpty()) return null
    return try {
      val side = side(context)
      val paint =
          TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
            typeface = ResourcesCompat.getFont(context, R.font.signika_semibold)
            // As the app sizes them: a bigger letter alone, two a little smaller.
            textSize = side * (if (text.codePointCount(0, text.length) > 1) 0.36f else 0.42f)
            color = Color.BLACK
            textAlign = Paint.Align.CENTER
          }
      val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ALPHA_8)
      val metrics = paint.fontMetrics
      Canvas(bitmap).drawText(text, side / 2f, side / 2f - (metrics.ascent + metrics.descent) / 2f, paint)
      bitmap
    } catch (_: Exception) {
      null
    }
  }

  private fun decode(bytes: ByteArray): Bitmap? {
    if (bytes.size > MAX_BYTES) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    // Decoded no larger than twice the face needs.
    var sample = 1
    while (min(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_PX * 2) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
  }

  private fun download(address: String, token: String): Bitmap? {
    val connection = URL(address).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 10_000
      connection.readTimeout = 15_000
      if (token.isNotEmpty()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (connection.responseCode != 200) return null
      return decode(connection.inputStream.use { it.readBytes() })
    } finally {
      connection.disconnect()
    }
  }

  /** The picture centred in a square crop, cut to the frame's continuous corner. */
  private fun frame(context: Context, picture: Bitmap): Bitmap {
    val side = side(context)
    val edge = min(picture.width, picture.height)
    val source = Rect((picture.width - edge) / 2, (picture.height - edge) / 2, (picture.width + edge) / 2, (picture.height + edge) / 2)
    val out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val radius = RADIUS_DP * side / SIDE_DP
    val path = Path()
    Squircle.addTo(path, 0f, 0f, side.toFloat(), side.toFloat(), floatArrayOf(radius, radius, radius, radius), side.toFloat(), 0f)
    canvas.clipPath(path)
    canvas.drawBitmap(picture, source, RectF(0f, 0f, side.toFloat(), side.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    return out
  }

  private fun prune(context: Context) {
    val files = dir(context).listFiles()?.sortedByDescending { it.lastModified() } ?: return
    files.drop(KEEP).forEach { it.delete() }
  }
}
