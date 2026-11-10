package com.stephenprn.carnet.widget

import android.app.LocaleManager
import android.os.Build
import android.os.LocaleList
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeWidgetsSpec
import org.json.JSONArray
import org.json.JSONObject

/** The widgets' side of JavaScript (specs/NativeWidgets.ts): it hands them what to draw and takes what was ticked. */
class WidgetsModule(private val reactContext: ReactApplicationContext) : NativeWidgetsSpec(reactContext) {

  private val store: WidgetStore
    get() = WidgetStore(reactContext)

  override fun placed(promise: Promise) {
    val placed = JSONArray()
    for ((kind, provider) in Widgets.DATA_KINDS) {
      for (id in Widgets.ids(reactContext, provider)) placed.put(JSONObject().put("id", id).put("kind", kind).put("target", store.target(id)))
    }
    promise.resolve(placed.toString())
  }

  override fun publish(widgetId: Double, payload: String) {
    val id = widgetId.toInt()
    store.setPayload(id, payload)
    Widgets.redraw(reactContext, id)
  }

  override fun share(shared: String) {
    applyLanguage(runCatching { JSONObject(shared).optString("locale") }.getOrDefault(""))
    if (!store.setShared(shared)) return
    // The language may have changed with it: every widget is drawn again in its words.
    Widgets.redrawEverything(reactContext)
  }

  /**
   * The language chosen in Réglages becomes the app's own language for Android (13 and later), so the
   * widgets' words, the launcher's picker and the system's settings speak it too, not only the screens.
   * The activity declares `locale` among its config changes: nothing restarts.
   */
  private fun applyLanguage(tag: String) {
    if (tag.isEmpty() || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val manager = reactContext.getSystemService(LocaleManager::class.java) ?: return
    val wanted = LocaleList.forLanguageTags(tag)
    if (manager.applicationLocales.toLanguageTags() == wanted.toLanguageTags()) return
    runCatching { manager.applicationLocales = wanted }
  }

  override fun setTarget(widgetId: Double, target: String) {
    store.setTarget(widgetId.toInt(), target)
  }

  override fun takeTicks(promise: Promise) {
    promise.resolve(store.takeTicks())
  }

  override fun quickClipboard(promise: Promise) {
    QuickActivity.clipboard { promise.resolve(it) }
  }

  override fun clearQuickScrim() {
    QuickActivity.withCurrent { it.clearScrim() }
  }

  override fun closeQuick(done: Boolean) {
    QuickActivity.withCurrent { it.close(done) }
  }
}
