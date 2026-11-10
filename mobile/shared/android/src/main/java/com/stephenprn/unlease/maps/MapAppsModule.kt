package com.stephenprn.unlease.maps

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Build
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeMapAppsSpec
import java.io.ByteArrayOutputStream
import java.text.Collator
import java.util.concurrent.Executors

/**
 * The phone's maps apps: those that open a place (`geo:`), listed by the app itself so the person
 * picks one (Android alone goes straight to its default one), and a place opened in the one picked.
 * Seen through the manifest's `<queries>` for `geo:` (Android 11's package visibility).
 */
class MapAppsModule(private val reactContext: ReactApplicationContext) : NativeMapAppsSpec(reactContext) {

  /** The icons are drawn off the module's thread: a dozen of them take a moment. */
  private val worker = Executors.newSingleThreadExecutor()

  override fun apps(promise: Promise) {
    worker.execute {
      try {
        val manager = reactContext.packageManager
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=Paris"))
        val own = reactContext.packageName
        val seen = mutableSetOf<String>()
        val found = mutableListOf<Pair<String, ResolveInfo>>()
        for (info in resolve(manager, probe)) {
          val name = info.activityInfo?.packageName ?: continue
          if (name == own || !seen.add(name)) continue
          found += info.loadLabel(manager).toString() to info
        }
        val collator = Collator.getInstance()
        val list = Arguments.createArray()
        for ((label, info) in found.sortedWith { a, b -> collator.compare(a.first, b.first) }) {
          val entry = Arguments.createMap()
          entry.putString("packageName", info.activityInfo.packageName)
          entry.putString("label", label)
          entry.putString("icon", iconOf(manager, info))
          list.pushMap(entry)
        }
        val result = Arguments.createMap()
        result.putArray("apps", list)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("maps_apps", error)
      }
    }
  }

  override fun open(uri: String, packageName: String, promise: Promise) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (resolve(reactContext.packageManager, intent).isEmpty()) {
      promise.resolve(false)
      return
    }
    try {
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(intent) else reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (_: ActivityNotFoundException) {
      promise.resolve(false)
    } catch (_: SecurityException) {
      promise.resolve(false)
    }
  }

  private fun resolve(manager: PackageManager, intent: Intent): List<ResolveInfo> =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        manager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
      } else {
        @Suppress("DEPRECATION") manager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
      }

  /** The app's icon drawn at 96 px, as a PNG `data:` address; '' when it cannot be drawn. */
  private fun iconOf(manager: PackageManager, info: ResolveInfo): String =
      try {
        val drawable = info.activityInfo.applicationInfo.loadIcon(manager)
        val bitmap = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, ICON_SIZE, ICON_SIZE)
        drawable.draw(canvas)
        val bytes = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
        bitmap.recycle()
        "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
      } catch (_: Exception) {
        ""
      }

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }

  private companion object {
    const val ICON_SIZE = 96
  }
}
