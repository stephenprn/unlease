package com.stephenprn.clock.widget

import android.app.LocaleManager
import android.os.Build
import android.os.LocaleList
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeWidgetsSpec
import org.json.JSONArray
import org.json.JSONObject

/**
 * Clock's side of the suite's Widgets spec (`mobile/shared/specs/NativeWidgets.ts`). Its one widget,
 * « Prochaine alarme », shows the same morning wherever it is placed: JavaScript hands it over once,
 * through `share`, and every placed one is drawn again. Nothing is pointed, ticked or asked from a
 * quick window here: those answer empty.
 */
class WidgetsModule(private val reactContext: ReactApplicationContext) : NativeWidgetsSpec(reactContext) {

  override fun placed(promise: Promise) {
    val placed = JSONArray()
    for (id in NextAlarmWidgetProvider.placed(reactContext)) placed.put(JSONObject().put("id", id).put("kind", "alarm").put("target", "alarm"))
    promise.resolve(placed.toString())
  }

  override fun publish(widgetId: Double, payload: String) {
    share(payload)
  }

  override fun share(shared: String) {
    applyLanguage(runCatching { JSONObject(shared).optString("locale") }.getOrDefault(""))
    if (WidgetStore(reactContext).setPayload(shared)) NextAlarmWidgetProvider.redrawAll(reactContext)
  }

  /**
   * The language chosen in Réglages becomes the app's own for Android (13 and later), so the widget's
   * picker speaks it too (as Agenda's). The activity declares `locale` among its config changes.
   */
  private fun applyLanguage(tag: String) {
    if (tag.isEmpty() || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val manager = reactContext.getSystemService(LocaleManager::class.java) ?: return
    val wanted = LocaleList.forLanguageTags(tag)
    if (manager.applicationLocales.toLanguageTags() == wanted.toLanguageTags()) return
    runCatching { manager.applicationLocales = wanted }
  }

  override fun setTarget(widgetId: Double, target: String) {}

  override fun takeTicks(promise: Promise) {
    promise.resolve("[]")
  }

  override fun quickClipboard(promise: Promise) {
    promise.resolve("")
  }

  override fun clearQuickScrim() {}

  override fun closeQuick(done: Boolean) {}
}
