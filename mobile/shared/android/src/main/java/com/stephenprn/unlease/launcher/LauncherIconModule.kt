package com.stephenprn.unlease.launcher

import android.app.ActivityManager
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeLauncherIconSpec

/**
 * The app's icon in the launcher. Android cannot paint one: each app has a launcher entry per palette
 * (an `<activity-alias>` of MainActivity whose meta-data names the palette, with the mark in its
 * primary: tools/icons/build_android_drawables.mjs), and one is on. Switching never stops the app
 * (DONT_KILL_APP), but Android closes the task the launcher opened through an entry turned off and
 * a launcher may drop that entry's shortcut from the home screen: the app switches once it has left
 * the screen, only when the palette changes (mobile/shared/src/app/launcherIcon.ts), and never while
 * another activity waits in its task to hand something back (`settled`).
 */
class LauncherIconModule(reactContext: ReactApplicationContext) : NativeLauncherIconSpec(reactContext) {

  private class Entry(val palette: String, val component: ComponentName, val target: String, val onByDefault: Boolean)

  /** The entries the manifest declares, read once: they never change while the app runs. */
  private val entries: List<Entry> by lazy { readEntries() }

  private fun readEntries(): List<Entry> {
    val context = reactApplicationContext
    val packages = context.packageManager
    val flags = PackageManager.GET_ACTIVITIES or PackageManager.GET_META_DATA or PackageManager.MATCH_DISABLED_COMPONENTS
    val info =
        try {
          if (Build.VERSION.SDK_INT >= 33) packages.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
          else @Suppress("DEPRECATION") packages.getPackageInfo(context.packageName, flags)
        } catch (_: PackageManager.NameNotFoundException) {
          return emptyList()
        }
    // An alias is listed with the activities, its target named.
    return info.activities.orEmpty().mapNotNull { activity ->
      val palette = activity.metaData?.getString(PALETTE) ?: return@mapNotNull null
      val target = activity.targetActivity ?: return@mapNotNull null
      Entry(palette, ComponentName(context.packageName, activity.name), target, activity.enabled)
    }
  }

  private fun isOn(entry: Entry): Boolean =
      when (reactApplicationContext.packageManager.getComponentEnabledSetting(entry.component)) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> entry.onByDefault
        else -> false
      }

  override fun current(): String = entries.filter(::isOn).singleOrNull()?.palette ?: ""

  /**
   * Whether every task the launcher opened shows MainActivity itself on top. React Native says the
   * app is in the background whenever it is paused, also under a picker, the camera or a
   * permission's dialog opened in its own task: closing that task would lose what they hand back,
   * so the switch waits for the next time.
   */
  private fun settled(): Boolean {
    val manager = reactApplicationContext.getSystemService(ActivityManager::class.java) ?: return true
    val opened = entries.map { it.component.className }.toSet()
    val shown = opened + entries.map { it.target }
    return manager.appTasks.all { task ->
      val info = runCatching { task.taskInfo }.getOrNull() ?: return@all true
      if (info.baseIntent?.component?.className !in opened) return@all true
      val top = info.topActivity ?: return@all true
      top.className in shown
    }
  }

  override fun choose(palette: String): Boolean {
    val chosen = entries.firstOrNull { it.palette == palette } ?: return false
    if (!settled()) return false
    // The chosen one on before the others go off: the launcher never has the app under no entry.
    val changes = buildList {
      if (!isOn(chosen)) add(chosen.component to PackageManager.COMPONENT_ENABLED_STATE_ENABLED)
      entries.filter { it !== chosen && isOn(it) }.forEach { add(it.component to PackageManager.COMPONENT_ENABLED_STATE_DISABLED) }
    }
    if (changes.isEmpty()) return true
    val packages = reactApplicationContext.packageManager
    if (Build.VERSION.SDK_INT >= 33) {
      // All at once, from Android 13.
      packages.setComponentEnabledSettings(changes.map { (component, state) -> PackageManager.ComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP) })
    } else {
      changes.forEach { (component, state) -> packages.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP) }
    }
    return true
  }

  override fun mainActivity(): String = entries.firstOrNull()?.target ?: ""

  companion object {
    /** The meta-data naming an entry's palette (`PALETTES`, packages/design/src/appearance.ts). */
    const val PALETTE = "com.stephenprn.unlease.launcher.palette"
  }
}
