package com.stephenprn.carnet.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import com.stephenprn.carnet.organic.Squircle
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors

/**
 * Link pictures for the collection widget: the server's display copy, fetched with the device's
 * token, cut to the row's 4:5 frame with the app's corner (`Squircle`) and kept in the cache, so the
 * launcher gets a small finished picture. Fetched once; the widget draws again when they land.
 */
internal object Thumbnails {
  private const val WIDTH_DP = 40f
  private const val HEIGHT_DP = 50f
  /** RADII.frame. */
  private const val RADIUS_DP = 12f
  private const val KEEP = 160
  private const val MAX_BYTES = 12 * 1024 * 1024

  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "widget-pictures").apply { isDaemon = true } }
  private val fetching = Collections.synchronizedSet(mutableSetOf<String>())
  /** Refused by the server (gone, not a picture): not asked again while the process lives. */
  private val refused = Collections.synchronizedSet(mutableSetOf<String>())

  private fun dir(context: Context) = File(context.cacheDir, "widget-pictures").apply { mkdirs() }

  private fun file(context: Context, id: String) = File(dir(context), "${id.filter { it.isLetterOrDigit() || it == '-' || it == '_' }}.png")

  fun cached(context: Context, id: String): Bitmap? = file(context, id).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }

  /** Fetches the pictures not kept yet, then draws the collection widgets again. Without a server, nothing. */
  fun fetch(context: Context, ids: List<String>, server: JSONObject?) {
    val base = server?.optString("url").orEmpty().trimEnd('/')
    val token = server?.optString("token").orEmpty()
    if (base.isEmpty() || ids.isEmpty()) return
    val app = context.applicationContext
    val missing = ids.distinct().filter { it !in refused && !file(app, it).exists() && fetching.add(it) }
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
          val framed = frame(app, picture)
          file(app, id).outputStream().use { framed.compress(Bitmap.CompressFormat.PNG, 100, it) }
          landed = true
        } catch (_: Exception) {
          // Offline: the frame keeps its glyph, and the next draw asks again.
        } finally {
          fetching.remove(id)
        }
      }
      if (landed) {
        prune(app)
        Widgets.redrawAll(app, CollectionWidgetProvider::class.java)
      }
    }
  }

  private fun download(address: String, token: String): Bitmap? {
    val connection = URL(address).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 10_000
      connection.readTimeout = 15_000
      if (token.isNotEmpty()) connection.setRequestProperty("Authorization", "Bearer $token")
      if (connection.responseCode != 200) return null
      val bytes = connection.inputStream.use { it.readBytes() }
      if (bytes.size > MAX_BYTES) return null
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      // Decoded no larger than twice the frame needs.
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= 240 && bounds.outHeight / (sample * 2) >= 300) sample *= 2
      return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    } finally {
      connection.disconnect()
    }
  }

  /** The picture centred in a 4:5 crop, cut to the frame's continuous corner. */
  private fun frame(context: Context, picture: Bitmap): Bitmap {
    val density = context.resources.displayMetrics.density
    val width = (WIDTH_DP * density).toInt()
    val height = (HEIGHT_DP * density).toInt()
    val ratio = WIDTH_DP / HEIGHT_DP
    val source =
        if (picture.width.toFloat() / picture.height > ratio) {
          val w = (picture.height * ratio).toInt()
          Rect((picture.width - w) / 2, 0, (picture.width + w) / 2, picture.height)
        } else {
          val h = (picture.width / ratio).toInt()
          Rect(0, (picture.height - h) / 2, picture.width, (picture.height + h) / 2)
        }
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val radius = RADIUS_DP * density
    val path = Path()
    Squircle.addTo(path, 0f, 0f, width.toFloat(), height.toFloat(), floatArrayOf(radius, radius, radius, radius), minOf(width, height).toFloat(), 0f)
    canvas.clipPath(path)
    canvas.drawBitmap(picture, source, RectF(0f, 0f, width.toFloat(), height.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    return out
  }

  private fun prune(context: Context) {
    val files = dir(context).listFiles()?.sortedByDescending { it.lastModified() } ?: return
    files.drop(KEEP).forEach { it.delete() }
  }
}
