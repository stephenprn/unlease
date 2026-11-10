package com.stephenprn.contacts.widget

import android.content.Context
import org.json.JSONObject

/**
 * What the widgets keep between draws: each one's target (`favorites`, `label:<id>`), the picture of
 * it JavaScript last handed over, and what they all share (the server their photos come from, the
 * language). JavaScript owns the contacts; this is their latest picture.
 */
internal class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun target(id: Int): String = prefs.getString("target.$id", "") ?: ""

  /** A new target drops the old picture: it shows other people. */
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

  private companion object {
    const val NAME = "contacts.widgets"
  }
}
