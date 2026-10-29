package com.stephenprn.carnet.widget

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.carnet.specs.NativeWidgetsSpec
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
    if (!store.setShared(shared)) return
    Widgets.redrawAll(reactContext, LinkWidgetProvider::class.java)
    Widgets.redrawAll(reactContext, CollectionWidgetProvider::class.java)
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
