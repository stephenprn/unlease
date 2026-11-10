package com.stephenprn.agenda.widget

import android.content.Context
import org.json.JSONObject

/**
 * What the widgets keep between draws: a countdown's target (`event:<id>`), the picture of each one
 * JavaScript last handed over, and what they all share (the language). JavaScript owns the events;
 * this is their latest picture.
 */
internal class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  /** What a countdown counts to; '' until chosen (and for the widgets that point at nothing). */
  fun target(id: Int): String = prefs.getString("target.$id", "") ?: ""

  /** A new target drops the old picture: it shows another event. */
  fun setTarget(id: Int, target: String) {
    prefs.edit().putString("target.$id", target).remove("payload.$id").apply()
  }

  /** The picture to draw; a widget pointed at something draws only a picture of it. */
  fun payload(id: Int): JSONObject? {
    val payload = prefs.getString("payload.$id", null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return null
    val target = target(id)
    return payload.takeIf { target.isEmpty() || it.optString("target") == target }
  }

  fun setPayload(id: Int, json: String) {
    prefs.edit().putString("payload.$id", json).apply()
  }

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

  private companion object {
    const val NAME = "agenda.widgets"
  }
}
