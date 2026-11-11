package com.stephenprn.carnet.shortcuts

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import android.os.Build
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.PathParser
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.carnet.MainActivity
import com.stephenprn.unlease.specs.NativeShortcutsSpec
import java.util.concurrent.Executors
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject

/**
 * Carnet's sharing shortcuts: its collections in Android's share sheet's first row (Direct Share),
 * dynamic shortcuts in the category its `<share-target>` names (res/xml/shortcuts.xml), which a
 * launcher may show too, after the static four (kept out of it, they left the share sheet as well). A
 * share through one reaches MainActivity's SEND filter with the shortcut's id (`collection:<id>`), and
 * its links go into that collection (src/app/intake.ts). JavaScript chooses them and their pictures
 * (src/app/shareShortcuts.ts): each collection's emblem on its stone, drawn here.
 */
class ShortcutsModule(reactContext: ReactApplicationContext) : NativeShortcutsSpec(reactContext) {

  /**
   * A collection filed into by the person: Android's share sheet ranks its targets by what is used, so
   * a collection a link was just put in rises in its first row (a no-op for one not published).
   */
  override fun reportShortcutUsed(id: String) {
    val context = reactApplicationContext.applicationContext
    io.execute { runCatching { ShortcutManagerCompat.reportShortcutUsed(context, id) } }
  }

  override fun setSharingShortcuts(shortcuts: String, promise: Promise) {
    val context = reactApplicationContext.applicationContext
    io.execute {
      try {
        promise.resolve(publish(context, JSONArray(shortcuts)))
      } catch (error: Exception) {
        promise.reject("shortcuts", error.message ?: "shortcuts", error)
      }
    }
  }

  companion object {
    /** What the manifest's `<share-target>` names. */
    const val CATEGORY = "com.stephenprn.carnet.category.COLLECTION"
    /** The share sheet shows a few of an app's at most (src/app/shareShortcuts.ts asks for as many). */
    private const val SHARE_SHEET_MAX = 4
    /** The emblem's side on the 108 canvas of an adaptive icon (whose middle 72 shows): as the app lays a 40 emblem on a 64 stone. */
    private const val EMBLEM = 44f

    private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "shortcuts-io").apply { isDaemon = true } }

    /** Publishes what fits, the first first; how many, or -1 when Android declined (rate-limited in the background). */
    private fun publish(context: Context, items: JSONArray): Int {
      val launcher = launcherEntry(context)
      val statics =
          runCatching { ShortcutManagerCompat.getShortcuts(context, ShortcutManagerCompat.FLAG_MATCH_MANIFEST).count { launcher == null || it.activity == launcher } }
              .getOrDefault(0)
      val room = minOf(SHARE_SHEET_MAX, ShortcutManagerCompat.getMaxShortcutCountPerActivity(context) - statics).coerceAtLeast(0)
      val shortcuts =
          (0 until items.length())
              .mapNotNull { index -> items.optJSONObject(index) }
              .filter { it.optString("id").isNotEmpty() && it.optString("label").isNotBlank() }
              .take(room)
              .mapIndexed { rank, item -> shortcut(context, item, rank, launcher) }
      // Those no longer offered leave the share sheet (and any cached by an earlier version, which outlive the dynamic list).
      val kept = shortcuts.map { it.id }.toSet()
      val gone = ShortcutManagerCompat.getDynamicShortcuts(context).map { it.id }.filter { it !in kept }
      if (gone.isNotEmpty()) ShortcutManagerCompat.removeLongLivedShortcuts(context, gone)
      return if (ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)) shortcuts.size else -1
    }

    private fun shortcut(context: Context, item: JSONObject, rank: Int, launcher: ComponentName?): ShortcutInfoCompat {
      val label = item.getString("label").trim()
      val open = Intent(Intent.ACTION_VIEW, Uri.parse(item.optString("uri")), context, MainActivity::class.java)
      return ShortcutInfoCompat.Builder(context, item.getString("id"))
          .setShortLabel(label)
          .setLongLabel(label)
          .setIcon(IconCompat.createWithAdaptiveBitmap(picture(context, item)))
          .setIntent(open)
          // Not long-lived: Android refuses a drawn picture on one (« Bitmaps are not allowed in long-lived
          // shortcuts »), and a dynamic sharing shortcut is enough for the share sheet's first row.
          .setCategories(setOf(CATEGORY))
          .setRank(rank)
          .apply { if (launcher != null) setActivity(launcher) }
          .build()
    }

    /** The emblem in its ink on its stone, filling an adaptive icon's canvas (the launcher or the share sheet cuts its shape). */
    private fun picture(context: Context, item: JSONObject): Bitmap {
      val size = (108 * context.resources.displayMetrics.density).roundToInt().coerceIn(108, 324)
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      canvas.drawColor(color(item.optString("stone"), Color.LTGRAY))
      val data = item.optString("path")
      val path = if (data.isEmpty()) null else runCatching { PathParser.createPathFromPathData(data) }.getOrNull()
      if (path != null) {
        path.fillType = if (item.optBoolean("evenOdd")) Path.FillType.EVEN_ODD else Path.FillType.WINDING
        val side = EMBLEM * size / 108f
        canvas.translate((size - side) / 2f, (size - side) / 2f)
        canvas.scale(side / 100f, side / 100f)
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(item.optString("ink"), Color.DKGRAY) })
      }
      return bitmap
    }

    private fun color(value: String, fallback: Int): Int = runCatching { Color.parseColor(value) }.getOrDefault(fallback)

    /**
     * The launcher entry that is on (one `<activity-alias>` per palette, mobile/shared/src/app/launcherIcon.ts):
     * a dynamic shortcut belongs to one, and goes when it is turned off.
     */
    private fun launcherEntry(context: Context): ComponentName? {
      val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
      val found =
          if (Build.VERSION.SDK_INT >= 33) context.packageManager.queryIntentActivities(query, PackageManager.ResolveInfoFlags.of(0))
          else @Suppress("DEPRECATION") context.packageManager.queryIntentActivities(query, 0)
      val activity = found.firstOrNull()?.activityInfo ?: return null
      return ComponentName(activity.packageName, activity.name)
    }
  }
}
