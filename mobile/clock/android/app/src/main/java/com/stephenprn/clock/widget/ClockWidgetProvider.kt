package com.stephenprn.clock.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.clock.R
import java.util.Locale

/**
 * Horloge: the time large and the day (TextClocks: they count by themselves, nothing redraws them),
 * in the app's format and language, then the next alarm as the engine counts it (`NextAlarmWidgetProvider.upcoming`):
 * the bell, its time, its name. Drawn again whenever the engine arms, and every half hour.
 */
class ClockWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) draw(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    draw(context, manager, id)
  }

  companion object {
    fun redrawAll(context: Context) = ToolWidgets.redraw(context, ClockWidgetProvider::class.java, ::draw)

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val (width, height) = ToolWidgets.size(manager, id, 300, 140)
      val views = RemoteViews(context.packageName, R.layout.widget_clock)
      val pattern = ToolWidgets.clockPattern(context)
      views.setCharSequence(R.id.clock_time, "setFormat24Hour", pattern)
      views.setCharSequence(R.id.clock_time, "setFormat12Hour", pattern)
      // The time as large as the slab holds: its height first, then its width (five figures, about 0.6 em each).
      val byHeight = (height - 60) * 0.85f
      val byWidth = (width - 32) / (if (pattern.startsWith("h")) 4.6f else 3.1f)
      views.setTextViewTextSize(R.id.clock_time, TypedValue.COMPLEX_UNIT_SP, minOf(88f, byHeight, byWidth).coerceAtLeast(28f))
      val locale = WidgetStore(context).payload()?.optString("locale")?.takeIf { it.isNotEmpty() }?.let { Locale.forLanguageTag(it) } ?: Locale.getDefault()
      val datePattern = DateFormat.getBestDateTimePattern(locale, if (width < 200) "EEEdMMM" else "EEEEdMMMM")
      views.setCharSequence(R.id.clock_date, "setFormat24Hour", datePattern)
      views.setCharSequence(R.id.clock_date, "setFormat12Hour", datePattern)
      views.setViewVisibility(R.id.clock_date, if (height < 90) View.GONE else View.VISIBLE)
      views.setOnClickPendingIntent(R.id.clock_open, ToolWidgets.open(context, "", 70))

      val next = NextAlarmWidgetProvider.upcoming(context)
      val shown = next != null && height >= 120
      views.setViewVisibility(R.id.clock_alarm, if (shown) View.VISIBLE else View.GONE)
      if (next != null && shown) {
        val (alarmId, time, title) = next
        views.setTextViewText(R.id.clock_alarm_text, "$time · $title")
        views.setContentDescription(R.id.clock_alarm, "$time, $title")
        views.setOnClickPendingIntent(R.id.clock_alarm, ToolWidgets.open(context, "alarm/$alarmId", 71))
      }
      manager.updateAppWidget(id, views)
    }
  }
}
