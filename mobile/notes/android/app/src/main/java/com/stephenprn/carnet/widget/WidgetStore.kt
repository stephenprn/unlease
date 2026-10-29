package com.stephenprn.carnet.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the widgets keep between draws: each one's target (a collection, a label or a note), the
 * picture of it JavaScript last handed over, what they all share, and the items ticked on the home
 * screen that JavaScript has not written yet. JavaScript owns the notes; this is their latest picture.
 */
internal class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun target(id: Int): String = prefs.getString("target.$id", "") ?: ""

  /** A new target drops the old picture: it shows something else. */
  fun setTarget(id: Int, target: String) {
    prefs.edit().putString("target.$id", target).remove("payload.$id").apply()
  }

  /** The picture to draw, only while it is of the widget's current target. */
  fun payload(id: Int): JSONObject? {
    val json = prefs.getString("payload.$id", null) ?: return null
    val payload = runCatching { JSONObject(json) }.getOrNull() ?: return null
    return payload.takeIf { it.optString("id") == target(id) }
  }

  fun setPayload(id: Int, json: String) {
    prefs.edit().putString("payload.$id", json).apply()
  }

  fun shared(): JSONObject = prefs.getString("shared", null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: JSONObject()

  /** True when it changed, so only then are the widgets drawn again. */
  fun setShared(json: String): Boolean {
    if (prefs.getString("shared", null) == json) return false
    prefs.edit().putString("shared", json).apply()
    return true
  }

  fun forget(ids: IntArray) {
    val edit = prefs.edit()
    for (id in ids) edit.remove("target.$id").remove("payload.$id")
    edit.apply()
  }

  /** A tick waiting for JavaScript; a later one on the same item replaces it. Written before returning. */
  fun addTick(checkId: String, checked: Boolean) {
    synchronized(LOCK) {
      val ticks = runCatching { JSONArray(prefs.getString("ticks", "[]")) }.getOrDefault(JSONArray())
      val next = JSONArray()
      for (i in 0 until ticks.length()) {
        val tick = ticks.optJSONObject(i) ?: continue
        if (tick.optString("id") != checkId) next.put(tick)
      }
      next.put(JSONObject().put("id", checkId).put("checked", checked))
      prefs.edit().putString("ticks", next.toString()).commit()
    }
  }

  /** Every waiting tick, as JSON, taken. */
  fun takeTicks(): String =
      synchronized(LOCK) {
        val ticks = prefs.getString("ticks", "[]") ?: "[]"
        prefs.edit().remove("ticks").commit()
        ticks
      }

  private companion object {
    const val NAME = "carnet.widgets"
    val LOCK = Any()
  }
}
