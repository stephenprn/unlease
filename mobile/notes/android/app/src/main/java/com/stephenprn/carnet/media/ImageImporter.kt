package com.stephenprn.carnet.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.min

data class ImportedImage(val path: String, val mime: String, val width: Int, val height: Int, val bytes: Int)

/**
 * Every image entering the app: made upright, at most 2560 px, re-encoded as JPEG (PNG if it has
 * alpha; GIFs copied untouched). Re-encoding matters: the server cannot decode HEIC.
 */
object ImageImporter {
  private const val MAX_SIDE = 2560
  private const val JPEG_QUALITY = 88

  fun import(context: Context, uri: Uri): ImportedImage? {
    val resolver = context.contentResolver
    val dir = File(context.filesDir, "photos").apply { mkdirs() }
    val mime = (resolver.getType(uri) ?: guessMime(uri.path ?: "")).lowercase()
    if (mime == "image/gif") {
      val target = File(dir, "${UUID.randomUUID()}.gif")
      resolver.openInputStream(uri)?.use { input -> target.outputStream().use { input.copyTo(it) } } ?: return null
      return describe(target, "image/gif")
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    // A bounds-only decode always returns null: only a missing stream means unreadable.
    val opened = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds); true } ?: false
    if (!opened || bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
    val decoded =
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: return null

    val rotation = resolver.openInputStream(uri)?.use { rotationOf(ExifInterface(it)) } ?: 0
    val scale = min(1f, MAX_SIDE.toFloat() / max(decoded.width, decoded.height))
    val matrix = Matrix().apply {
      if (scale < 1f) postScale(scale, scale)
      if (rotation != 0) postRotate(rotation.toFloat())
    }
    val upright = if (matrix.isIdentity) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)

    val png = mime == "image/png" && upright.hasAlpha()
    val target = File(dir, "${UUID.randomUUID()}.${if (png) "png" else "jpg"}")
    target.outputStream().use { upright.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
    if (upright !== decoded) decoded.recycle()
    upright.recycle()
    return describe(target, if (png) "image/png" else "image/jpeg")
  }

  fun describe(file: File, mime: String): ImportedImage {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    val rotation = try { rotationOf(ExifInterface(file.absolutePath)) } catch (_: Exception) { 0 }
    val swap = rotation == 90 || rotation == 270
    return ImportedImage(
        path = file.absolutePath,
        mime = mime,
        width = (if (swap) bounds.outHeight else bounds.outWidth).coerceAtLeast(0),
        height = (if (swap) bounds.outWidth else bounds.outHeight).coerceAtLeast(0),
        bytes = file.length().coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
    )
  }

  fun guessMime(name: String): String {
    val lower = name.lowercase()
    return when {
      lower.endsWith(".png") -> "image/png"
      lower.endsWith(".gif") -> "image/gif"
      lower.endsWith(".webp") -> "image/webp"
      lower.endsWith(".heic") || lower.endsWith(".heif") -> "image/heic"
      else -> "image/jpeg"
    }
  }

  private fun rotationOf(exif: ExifInterface): Int =
      when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
      }
}
