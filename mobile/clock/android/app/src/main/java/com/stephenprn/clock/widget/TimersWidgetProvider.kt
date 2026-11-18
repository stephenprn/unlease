package com.stephenprn.clock.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.clock.R
import com.stephenprn.clock.tools.TimerEngine
import com.stephenprn.clock.tools.TimerRunRecord
import com.stephenprn.clock.tools.ToolReceiver
import com.stephenprn.clock.tools.ToolStore

/**
 * Minuteurs: the timers this phone runs, each on its card counting down by itself (a Chronometer: no
 * redraw each second), with « +1 min » and pause or resume, a ringing one with « Arrêter »; then the
 * saved timers JavaScript handed (`tools.timers`), a row each that starts it at once through
 * `ToolReceiver`, with the app closed; none saved, the usual lengths. As many rows as the height holds.
 * Drawn again whenever a timer changes (`ToolEvents`) or the saved ones do.
 */
class TimersWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) draw(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    draw(context, manager, id)
  }

  companion object {
    private const val HEAD = 56
    private const val RUN_ROW = 68
    private const val SAVED_ROW = 52

    fun redrawAll(context: Context) = ToolWidgets.redraw(context, TimersWidgetProvider::class.java, ::draw)

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val (width, height) = ToolWidgets.size(manager, id, 250, 250)
      val views = RemoteViews(context.packageName, R.layout.widget_timers)
      val title = ToolWidgets.word(context, "timers", R.string.widget_timers_label)
      WidgetType.title(context, views, R.id.timers_title_image, R.id.timers_title, title, WidgetType.Face.TITLE, (width - 80).toFloat(), 1, R.color.wgen_ink)
      views.setOnClickPendingIntent(R.id.timers_head, ToolWidgets.open(context, "timers", 40))
      views.setContentDescription(R.id.timers_add, ToolWidgets.word(context, "newTimer", R.string.widget_new_timer))
      views.setOnClickPendingIntent(R.id.timers_add, ToolWidgets.open(context, "timers/new", 41))
      views.removeAllViews(R.id.timers_list)

      var room = height - HEAD
      val runs = ToolStore(context).runs().sortedBy { it.startedAt }
      val now = System.currentTimeMillis()
      for (run in runs) {
        if (room < RUN_ROW) break
        views.addView(R.id.timers_list, runRow(context, run, now, width))
        room -= RUN_ROW
      }
      val saved = ToolWidgets.array(context, "timers")
      val quick = ToolWidgets.array(context, "quick")
      val list = if (saved.length() > 0) saved else quick
      for (index in 0 until list.length()) {
        if (room < SAVED_ROW) break
        val item = list.optJSONObject(index) ?: continue
        views.addView(R.id.timers_list, savedRow(context, item, saved.length() > 0))
        room -= SAVED_ROW
      }
      manager.updateAppWidget(id, views)
    }

    private fun runRow(context: Context, run: TimerRunRecord, now: Long, width: Int): RemoteViews {
      val row = RemoteViews(context.packageName, R.layout.widget_timer_run)
      val words = ToolStore(context).words(context)
      val ringing = run.state == TimerRunRecord.RINGING
      val running = run.state == TimerRunRecord.RUNNING
      row.setTextViewText(R.id.run_name, if (ringing) words.timeUp else TimerEngine.name(run, words))
      WidgetKit.textColor(context, row, R.id.run_name, if (ringing) R.color.wgen_link else R.color.wgen_ink_muted)
      // The Chronometer counts on the phone's uptime: its base is the end (counting down) or, ringing, the end it counts up from.
      val left = run.remaining(now)
      if (running || ringing) {
        val base = SystemClock.elapsedRealtime() + (run.endsAt - now)
        row.setViewVisibility(R.id.run_clock, View.VISIBLE)
        row.setViewVisibility(R.id.run_left, View.GONE)
        row.setChronometer(R.id.run_clock, base, null, true)
        row.setChronometerCountDown(R.id.run_clock, running)
      } else {
        row.setViewVisibility(R.id.run_clock, View.GONE)
        row.setViewVisibility(R.id.run_left, View.VISIBLE)
        row.setTextViewText(R.id.run_left, TimerEngine.countdown(left))
      }
      row.setTextViewText(R.id.run_add, words.addMinute)
      row.setOnClickPendingIntent(R.id.run_add, TimerEngine.action(context, run.id, "add"))
      // Narrow (two cells), the countdown keeps its room: « +1 min » goes, the card still opens the timers.
      row.setViewVisibility(R.id.run_add, if (width < 240) View.GONE else View.VISIBLE)
      if (ringing) {
        // Ringing: the close glyph stops it (« +1 min » starts it again for a minute).
        row.setImageViewResource(R.id.run_toggle, R.drawable.wgen_g_close)
        row.setContentDescription(R.id.run_toggle, words.stop)
        row.setOnClickPendingIntent(R.id.run_toggle, TimerEngine.action(context, run.id, "stop"))
      } else {
        row.setImageViewResource(R.id.run_toggle, if (running) R.drawable.wgen_g_pause else R.drawable.wgen_g_go)
        row.setContentDescription(R.id.run_toggle, if (running) words.pause else words.resume)
        row.setOnClickPendingIntent(R.id.run_toggle, TimerEngine.action(context, run.id, if (running) "pause" else "resume"))
      }
      row.setOnClickPendingIntent(R.id.run_row, TimerEngine.openTimers(context, 42))
      return row
    }

    private fun savedRow(context: Context, item: org.json.JSONObject, saved: Boolean): RemoteViews {
      val row = RemoteViews(context.packageName, R.layout.widget_timer_saved)
      val seconds = item.optLong("seconds", 300L)
      val length = item.optString("length").ifEmpty { TimerEngine.lengthWords(seconds * 1000L) }
      val label = item.optString("label")
      row.setTextViewText(R.id.saved_length, length)
      row.setTextViewText(R.id.saved_label, label)
      val start = ToolWidgets.word(context, "startTimer", R.string.widget_start_timer).replace("%1\$s", "{name}").replace("{name}", label.ifEmpty { length })
      row.setContentDescription(R.id.saved_row, start)
      val intent =
          Intent(context, ToolReceiver::class.java)
              .setAction(TimerEngine.ACTION_START)
              .setData(Uri.parse("unlease-clock-timer:start:${if (saved) item.optString("id") else "len$seconds"}"))
              .putExtra(TimerEngine.EXTRA_SECONDS, seconds)
      if (saved) intent.putExtra(TimerEngine.EXTRA_TIMER, item.optString("id"))
      row.setOnClickPendingIntent(R.id.saved_row, PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      return row
    }
  }
}
