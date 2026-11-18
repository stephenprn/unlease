package com.stephenprn.clock.widget

import android.content.Context
import org.json.JSONObject

/**
 * What JavaScript last handed the widget (`widgetPayloads.ts`): each morning's first event by alarm
 * and day, the alarms' times as the app writes them, the words in the app's language. The alarms
 * themselves are the engine's (`AlarmStore`).
 */
internal class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun payload(): JSONObject? = prefs.getString(PAYLOAD, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  /** True when it changed, so only then is the widget drawn again. */
  fun setPayload(json: String): Boolean {
    if (prefs.getString(PAYLOAD, null) == json) return false
    prefs.edit().putString(PAYLOAD, json).apply()
    return true
  }

  private companion object {
    const val NAME = "clock.widgets"
    const val PAYLOAD = "payload"
  }
}
