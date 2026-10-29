package com.stephenprn.carnet.media

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.os.ext.SdkExtensions
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.stephenprn.carnet.specs.NativeMediaSpec
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.ZipInputStream
import kotlin.math.min

/**
 * Photos, the Keep archive and one document (a backup archive); everything handed back is a file in
 * app storage, written first. And a file the app made, saved where the person chooses.
 * No storage or camera permission: declaring CAMERA would make ACTION_IMAGE_CAPTURE require it.
 */
class MediaModule(private val reactContext: ReactApplicationContext) : NativeMediaSpec(reactContext), ActivityEventListener {

  private data class Pending(val promise: Promise, val kind: Int, val captureFile: File? = null, val bytes: ByteArray? = null)

  private val pending = AtomicReference<Pending?>(null)
  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "media-io").apply { isDaemon = true } }

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    pending.getAndSet(null)?.let { it.promise.resolve(resultFor(it.kind, "cancelled")) }
    io.shutdown()
    super.invalidate()
  }

  override fun pickImages(max: Double, promise: Promise) {
    val limit = max.toInt().coerceAtLeast(1)
    val intent =
        if (photoPickerAvailable()) {
          Intent(MediaStore.ACTION_PICK_IMAGES).apply {
            type = "image/*"
            if (limit > 1) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, min(limit, MediaStore.getPickImagesMaxLimit()))
          }
        } else {
          Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, limit > 1)
          }
        }
    launch(intent, Pending(promise, REQUEST_PICK))
  }

  override fun capturePhoto(promise: Promise) {
    val file = File(dir("photos"), "capture-${UUID.randomUUID()}.jpg")
    val uri = FileProvider.getUriForFile(reactContext, "${reactContext.packageName}.files", file)
    val intent =
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
          putExtra(MediaStore.EXTRA_OUTPUT, uri)
          addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    launch(intent, Pending(promise, REQUEST_CAPTURE, file))
  }

  override fun pickKeepArchive(promise: Promise) {
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "application/zip"
          // Takeout archives reach the picker typed every possible way.
          putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"))
        }
    launch(intent, Pending(promise, REQUEST_ARCHIVE))
  }

  override fun pickFile(mimeTypes: ReadableArray, promise: Promise) {
    val types = (0 until mimeTypes.size()).mapNotNull { mimeTypes.getString(it) }.toTypedArray()
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = types.firstOrNull() ?: "*/*"
          if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types)
        }
    launch(intent, Pending(promise, REQUEST_FILE))
  }

  override fun saveFile(name: String, mime: String, base64: String, promise: Promise) {
    val bytes =
        try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
          promise.resolve(savedResult("error", "Fichier illisible"))
          return
        }
    // The system's own save screen: the person picks the folder and may rename it; no permission needed.
    val intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = mime
          putExtra(Intent.EXTRA_TITLE, name)
        }
    launch(intent, Pending(promise, REQUEST_SAVE, bytes = bytes))
  }

  private fun launch(intent: Intent, request: Pending) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      request.promise.resolve(resultFor(request.kind, "error", "Aucune fenêtre active"))
      return
    }
    // One picker at a time: a second tap settles the first as cancelled, never orphaned.
    pending.getAndSet(request)?.let { previous -> previous.promise.resolve(resultFor(previous.kind, "cancelled")) }
    try {
      activity.startActivityForResult(intent, request.kind)
    } catch (error: Exception) {
      pending.getAndSet(null)?.let { it.promise.resolve(resultFor(it.kind, "error", "Aucune application ne peut ouvrir ceci")) }
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_PICK && requestCode != REQUEST_CAPTURE && requestCode != REQUEST_ARCHIVE && requestCode != REQUEST_FILE && requestCode != REQUEST_SAVE) return
    val request = pending.getAndSet(null) ?: return
    if (resultCode != Activity.RESULT_OK) {
      request.captureFile?.delete()
      request.promise.resolve(resultFor(requestCode, "cancelled"))
      return
    }
    io.execute {
      try {
        when (requestCode) {
          REQUEST_PICK -> {
            val uris = mutableListOf<Uri>()
            data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
            if (uris.isEmpty()) data?.data?.let { uris.add(it) }
            val files = Arguments.createArray()
            uris.mapNotNull { importImage(it) }.forEach { files.pushMap(it) }
            request.promise.resolve(mediaResult("ok", files = files))
          }
          REQUEST_CAPTURE -> {
            val source = request.captureFile
            val imported = source?.takeIf { it.length() > 0 }?.let { importImage(Uri.fromFile(it)) }
            source?.delete()
            if (imported == null) {
              request.promise.resolve(mediaResult("cancelled"))
            } else {
              request.promise.resolve(mediaResult("ok", files = Arguments.createArray().apply { pushMap(imported) }))
            }
          }
          REQUEST_ARCHIVE -> request.promise.resolve(extractKeep(data?.data))
          REQUEST_FILE -> request.promise.resolve(copyDocument(data?.data))
          REQUEST_SAVE -> request.promise.resolve(writeDocument(data?.data, request.bytes))
        }
      } catch (error: Exception) {
        val fallback = when (requestCode) {
          REQUEST_ARCHIVE -> "Archive illisible"
          REQUEST_FILE -> "Fichier illisible"
          REQUEST_SAVE -> "Fichier impossible à écrire"
          else -> "Image illisible"
        }
        request.promise.resolve(resultFor(requestCode, "error", error.message ?: fallback))
      }
    }
  }

  override fun onNewIntent(intent: Intent) {}

  private fun importImage(uri: Uri): WritableMap? = ImageImporter.import(reactContext, uri)?.let { toMap(it) }

  override fun describeImage(path: String, promise: Promise) {
    io.execute {
      val file = File(path.removePrefix("file://"))
      val map = if (file.exists() && insideApp(file)) toMap(ImageImporter.describe(file, ImageImporter.guessMime(file.name))) else null
      if (map == null) promise.reject("not_found", "Image introuvable") else promise.resolve(map)
    }
  }

  private fun toMap(image: ImportedImage): WritableMap =
      Arguments.createMap().apply {
        putString("path", image.path)
        putString("mime", image.mime)
        putInt("width", image.width)
        putInt("height", image.height)
        putInt("bytes", image.bytes)
      }

  /**
   * Keeps only Takeout's `Keep/` folder: JSON into the cache, images into files.
   * Entry names are cut to their base name, so no entry can write outside those directories.
   */
  private fun extractKeep(uri: Uri?): WritableMap {
    if (uri == null) return archiveResult("error", "Aucun fichier choisi")
    val stamp = System.currentTimeMillis().toString()
    val jsonDir = File(reactContext.cacheDir, "keep-import/$stamp").apply { mkdirs() }
    val imageDir = File(reactContext.filesDir, "keep-import/$stamp").apply { mkdirs() }
    val entries = Arguments.createArray()
    var count = 0
    reactContext.contentResolver.openInputStream(uri)?.use { stream ->
      ZipInputStream(stream.buffered()).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          val name = entry.name.replace('\\', '/')
          val inKeep = name.contains("/Keep/") || name.startsWith("Keep/")
          if (entry.isDirectory || !inKeep) continue
          val base = name.substringAfterLast('/').replace(Regex("[^A-Za-z0-9._ \\-()]"), "_").take(180)
          if (base.isBlank() || base.startsWith(".")) continue
          val lower = base.lowercase()
          val target =
              when {
                lower.endsWith(".json") -> File(jsonDir, base)
                IMAGE_EXTENSIONS.any { lower.endsWith(it) } -> File(imageDir, base)
                else -> null
              } ?: continue
          var written = 0L
          target.outputStream().use { out ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = zip.read(buffer)
              if (read < 0) break
              written += read
              if (written > MAX_ENTRY_BYTES) break
              out.write(buffer, 0, read)
            }
          }
          if (written > MAX_ENTRY_BYTES) {
            target.delete()
            continue
          }
          entries.pushMap(Arguments.createMap().apply {
            putString("name", name)
            putString("path", target.absolutePath)
            putInt("bytes", written.toInt())
          })
          count += 1
        }
      }
    } ?: return archiveResult("error", "Archive illisible")
    if (count == 0) {
      jsonDir.deleteRecursively()
      imageDir.deleteRecursively()
    }
    return Arguments.createMap().apply {
      putString("status", "ok")
      putString("message", "")
      putString("dir", jsonDir.absolutePath)
      putArray("entries", entries)
    }
  }

  /** The picked document, copied whole into the cache before the grant lapses; its name cut to safe characters. */
  private fun copyDocument(uri: Uri?): WritableMap {
    if (uri == null) return fileResult("error", "Aucun fichier choisi")
    val resolver = reactContext.contentResolver
    val shown = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "sauvegarde.tar.gz"
    val name = shown.replace(Regex("[^A-Za-z0-9._ \\-()]"), "_").take(180).ifBlank { "sauvegarde.tar.gz" }
    val target = File(File(reactContext.cacheDir, "picked/${UUID.randomUUID()}").apply { mkdirs() }, name)
    val copied = resolver.openInputStream(uri)?.use { input -> target.outputStream().use { output -> input.copyTo(output, 64 * 1024) } }
        ?: return fileResult("error", "Fichier illisible")
    return Arguments.createMap().apply {
      putString("status", "ok")
      putString("message", "")
      putString("path", target.absolutePath)
      putString("name", shown)
      putDouble("bytes", copied.toDouble())
    }
  }

  /** The made file's bytes, written into the document the person just named. */
  private fun writeDocument(uri: Uri?, bytes: ByteArray?): WritableMap {
    if (uri == null || bytes == null) return savedResult("error", "Aucun fichier choisi")
    reactContext.contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) } ?: return savedResult("error", "Fichier impossible à écrire")
    return savedResult("ok")
  }

  override fun readText(path: String, promise: Promise) {
    io.execute {
      val file = File(path.removePrefix("file://"))
      if (!insideApp(file) || !file.isFile) promise.reject("not_found", "Fichier introuvable")
      else promise.resolve(file.readText(Charsets.UTF_8))
    }
  }

  override fun remove(path: String, promise: Promise) {
    io.execute {
      val file = File(path.removePrefix("file://"))
      promise.resolve(insideApp(file) && file.deleteRecursively())
    }
  }

  /** Only the app's own directories may be read or deleted through this module. */
  private fun insideApp(file: File): Boolean {
    val canonical = file.canonicalPath
    return listOf(reactContext.filesDir, reactContext.cacheDir).any { canonical.startsWith(it.canonicalPath + File.separator) }
  }

  private fun dir(name: String): File = File(reactContext.filesDir, name).apply { mkdirs() }

  private fun photoPickerAvailable(): Boolean =
      Build.VERSION.SDK_INT >= 33 || (Build.VERSION.SDK_INT >= 30 && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2)

  private fun mediaResult(status: String, message: String = "", files: com.facebook.react.bridge.WritableArray? = null): WritableMap =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
        putArray("files", files ?: Arguments.createArray())
      }

  private fun fileResult(status: String, message: String = ""): WritableMap =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
        putString("path", "")
        putString("name", "")
        putDouble("bytes", 0.0)
      }

  private fun savedResult(status: String, message: String = ""): WritableMap =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
      }

  /** A settled request's answer, in the shape its method promises. */
  private fun resultFor(kind: Int, status: String, message: String = ""): WritableMap =
      when (kind) {
        REQUEST_ARCHIVE -> archiveResult(status, message)
        REQUEST_FILE -> fileResult(status, message)
        REQUEST_SAVE -> savedResult(status, message)
        else -> mediaResult(status, message)
      }

  private fun archiveResult(status: String, message: String = ""): WritableMap =
      Arguments.createMap().apply {
        putString("status", status)
        putString("message", message)
        putString("dir", "")
        putArray("entries", Arguments.createArray())
      }

  companion object {
    private const val REQUEST_PICK = 4101
    private const val REQUEST_CAPTURE = 4102
    private const val REQUEST_ARCHIVE = 4103
    private const val REQUEST_FILE = 4104
    private const val REQUEST_SAVE = 4105
    private const val MAX_ENTRY_BYTES = 50L * 1024 * 1024
    private val IMAGE_EXTENSIONS = listOf(".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic")
  }
}
