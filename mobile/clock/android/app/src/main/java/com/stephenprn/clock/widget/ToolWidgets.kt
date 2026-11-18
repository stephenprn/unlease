package com.stephenprn.clock.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.UserManager
import com.stephenprn.clock.BuildConfig
import com.stephenprn.clock.MainActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the timers', the stopwatch's, the world clocks' and the big clock's widgets share: the words
 * JavaScript handed (`tools` in `widgetPayloads.ts`, in the app's language; the phone's own strings
 * until it has), the app's links, and redrawing every placed one of a kind.
 */
internal object ToolWidgets {
  /** The `tools` part of what JavaScript last handed the widgets. */
  fun payload(context: Context): JSONObject? = WidgetStore(context).payload()?.optJSONObject("tools")

  fun words(context: Context): JSONObject? = payload(context)?.optJSONObject("words")

  /** A word in the app's language, else the phone's string. */
  fun word(context: Context, key: String, fallback: Int): String = words(context)?.optString(key)?.takeIf { it.isNotEmpty() } ?: context.getString(fallback)

  fun array(context: Context, key: String): JSONArray = payload(context)?.optJSONArray(key) ?: JSONArray()

  /** Whether the app writes times on twelve hours (its own setting, else the phone's). */
  fun twelveHours(context: Context): Boolean {
    val payload = WidgetStore(context).payload()
    return if (payload?.has("twelveHours") == true) payload.optBoolean("twelveHours") else !android.text.format.DateFormat.is24HourFormat(context)
  }

  /** `unlease-clock://<path>` in the app (RootNavigator's linking); the request code tells taps apart. */
  fun open(context: Context, path: String, code: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://$path"), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** Every placed widget of a provider, drawn again by `draw`; never before the first unlock (the launcher shows none then), never failing an alarm. */
  fun redraw(context: Context, provider: Class<*>, draw: (Context, AppWidgetManager, Int) -> Unit) {
    try {
      if (context.getSystemService(UserManager::class.java)?.isUserUnlocked == false) return
      val manager = AppWidgetManager.getInstance(context)
      for (id in manager.getAppWidgetIds(ComponentName(context, provider))) draw(context, manager, id)
    } catch (_: Exception) {}
  }

  fun placed(context: Context, provider: Class<*>): IntArray = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, provider))

  /** The widget's size as the launcher shows it upright, in dp: (width, height); a guess until placed. */
  fun size(manager: AppWidgetManager, id: Int, width: Int, height: Int): Pair<Int, Int> {
    val options = manager.getAppWidgetOptions(id)
    val w = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
    val h = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
    return Pair(if (w > 0) w else width, if (h > 0) h else height)
  }

  /** A clock pattern for a TextClock, in the app's format. */
  fun clockPattern(context: Context): String = if (twelveHours(context)) "h:mm a" else "HH:mm"
}
