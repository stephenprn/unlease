package com.stephenprn.clock.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.clock.R
import com.stephenprn.clock.tools.StopwatchEngine
import com.stephenprn.clock.tools.ToolStore

/**
 * Chronomètre: the stopwatch counting by itself (a Chronometer on the phone's uptime, so nothing
 * redraws it each second), the lap under way under it once there are laps, « Tour » running or
 * « Réinitialiser » paused, and the leaf pebble that starts or pauses it: all with the app closed,
 * through `ToolReceiver`. One cell or one row narrow: the time and the pebble alone.
 */
class StopwatchWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) draw(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    draw(context, manager, id)
  }

  companion object {
    fun redrawAll(context: Context) = ToolWidgets.redraw(context, StopwatchWidgetProvider::class.java, ::draw)

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val (width, height) = ToolWidgets.size(manager, id, 250, 110)
      val views = RemoteViews(context.packageName, R.layout.widget_stopwatch)
      val store = ToolStore(context)
      val watch = store.stopwatch()
      val words = store.words(context)
      val now = System.currentTimeMillis()
      val elapsed = watch.elapsed(now)
      val narrow = width < 200
      // The figure as large as the cell holds: 44 two rows high and wide enough, a step smaller else.
      views.setTextViewTextSize(R.id.sw_clock, android.util.TypedValue.COMPLEX_UNIT_SP, if (narrow) 26f else if (height < 100) 34f else 44f)
      views.setChronometer(R.id.sw_clock, SystemClock.elapsedRealtime() - elapsed, null, watch.running)
      views.setViewVisibility(R.id.sw_title, if (height < 90 || narrow) View.GONE else View.VISIBLE)
      views.setTextViewText(R.id.sw_title, words.stopwatch)

      val lap = watch.laps.isNotEmpty() && !narrow
      views.setViewVisibility(R.id.sw_lap_line, if (lap) View.VISIBLE else View.GONE)
      if (lap) {
        views.setTextViewText(R.id.sw_lap_label, words.lapNumber.replace("{number}", (watch.laps.size + 1).toString()))
        views.setChronometer(R.id.sw_lap, SystemClock.elapsedRealtime() - (elapsed - watch.laps.last()), null, watch.running)
      }

      views.setViewVisibility(R.id.sw_secondary, if (watch.reset || narrow) View.GONE else View.VISIBLE)
      views.setImageViewResource(R.id.sw_secondary, if (watch.running) R.drawable.wgen_g_flag else R.drawable.wgen_g_restore)
      views.setContentDescription(R.id.sw_secondary, if (watch.running) words.lap else words.reset)
      views.setOnClickPendingIntent(R.id.sw_secondary, StopwatchEngine.action(context, if (watch.running) "lap" else "reset"))

      views.setImageViewResource(R.id.sw_primary, if (watch.running) R.drawable.wgen_g_pause_on_leaf else R.drawable.wgen_g_go_on_leaf)
      views.setContentDescription(R.id.sw_primary, if (watch.running) words.pause else if (watch.reset) ToolWidgets.word(context, "start", R.string.widget_start) else words.resume)
      views.setOnClickPendingIntent(R.id.sw_primary, StopwatchEngine.action(context, "toggle"))
      views.setOnClickPendingIntent(R.id.sw_open, StopwatchEngine.open(context, 50))
      views.setContentDescription(R.id.sw_open, "${words.stopwatch}, ${StopwatchEngine.clock(elapsed)}")
      manager.updateAppWidget(id, views)
    }
  }
}
