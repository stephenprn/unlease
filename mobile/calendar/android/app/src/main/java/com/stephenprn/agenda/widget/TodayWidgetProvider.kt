package com.stephenprn.agenda.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.agenda.R
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONObject

/**
 * Aujourd'hui: the day at a glance, as the app's view reads it (`todayWidget.ts` hands it over: today
 * and the day after, so a draw after midnight starts on the right day). As it draws it drops what
 * ended (a reminder's moment stays: still to do until Carnet's « Fait ») and says « En cours » for
 * what runs; it asks to be drawn again at the next start or end it holds, and at midnight, so that
 * stays true between the half-hourly draws.
 *
 * Two cells: what runs or comes next (its time, its title in Signika, its place or how many more
 * today), else tomorrow's first thing. Three cells or rows and more: its head (the day, its weather,
 * + a new event), then a list: what is left of today, Carnet's reminders missed under « En retard »,
 * tomorrow's birthdays, all-day events and first events. Every row opens what it is.
 */
class TodayWidgetProvider : AgendaWidgetProvider() {

  private enum class Form(val layout: Int) {
    SMALL(R.layout.widget_today_small),
    LIST(R.layout.widget_today),
  }

  /** The day shown and what of it is left now. */
  private class Day(val data: JSONObject, val rows: List<JSONObject>, val all: Int)

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val data = WidgetStore(context).payload(id) ?: return WidgetMessage.waiting(context)
    val now = System.currentTimeMillis()
    val day = day(data, now) ?: return WidgetMessage.waiting(context)
    scheduleNext(context, id, day, now)
    val width = WidgetType.widthDp(manager, id)
    if (Build.VERSION.SDK_INT >= 31) {
      return RemoteViews(
          mapOf(
              SizeF(40f, 40f) to views(context, data, day, now, Form.SMALL, width, id),
              SizeF(160f, 100f) to views(context, data, day, now, Form.LIST, width, id),
              SizeF(100f, 160f) to views(context, data, day, now, Form.LIST, width, id),
          ),
      )
    }
    val options = manager.getAppWidgetOptions(id)
    val wide = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) >= 160
    val tall = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) >= 160
    return views(context, data, day, now, if (wide || tall) Form.LIST else Form.SMALL, width, id)
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    super.onDeleted(context, widgetIds)
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    for (id in widgetIds) alarms.cancel(redrawIntent(context, id))
  }

  /** Today's day of the picture (the first not past), what of it is left: whole days, what runs or is to come, reminders come and still set. */
  private fun day(data: JSONObject, now: Long): Day? {
    val days = data.optJSONArray("days") ?: return null
    val today = WidgetKit.today()
    val all = (0 until days.length()).mapNotNull { days.optJSONObject(it) }
    val shown = all.firstOrNull { it.optString("day") >= today } ?: return null
    val rows = rows(shown, "rows")
    return Day(shown, rows.filter { it.optBoolean("allDay") || it.optBoolean("moment") || it.optLong("endAt") > now }, rows.size)
  }

  private fun rows(data: JSONObject, name: String): List<JSONObject> {
    val list = data.optJSONArray(name) ?: return emptyList()
    return (0 until list.length()).mapNotNull { list.optJSONObject(it) }
  }

  private fun running(row: JSONObject, now: Long): Boolean = !row.optBoolean("allDay") && !row.optBoolean("moment") && row.optLong("startAt") <= now && now < row.optLong("endAt")

  /** « En cours · 13:30 – 15:00 » while it runs, else its time; its place after. */
  private fun line(row: JSONObject, words: JSONObject, now: Long, withPlace: Boolean): String {
    val time = row.optString("time")
    val stated = if (running(row, now)) "${words.optString("now")} · $time" else time
    val place = row.optString("place")
    return if (withPlace && place.isNotEmpty()) "$stated · $place" else stated
  }

  private fun views(context: Context, data: JSONObject, day: Day, now: Long, form: Form, width: Float, id: Int): RemoteViews {
    val views = widgetViews(context, form.layout)
    val words = data.optJSONObject("words") ?: JSONObject()
    return when (form) {
      Form.SMALL -> small(context, views, day, words, now, width, id)
      Form.LIST -> list(context, views, data, day, words, now, width, id)
    }
  }

  private fun small(context: Context, views: RemoteViews, day: Day, words: JSONObject, now: Long, width: Float, id: Int): RemoteViews {
    views.setTextViewText(R.id.today_day, day.data.optString("label"))
    // What runs first, else what comes next (a reminder come is shown in the list, not here).
    val first = day.rows.firstOrNull { running(it, now) } ?: day.rows.firstOrNull { !it.optBoolean("allDay") && it.optLong("startAt") > now } ?: day.rows.firstOrNull { it.optBoolean("allDay") }
    // The paddings (12 each), the stripe (5) and its gap (10) aside.
    val room = width - 39f
    if (first == null) {
      val tomorrow = rows(day.data, "tomorrow").firstOrNull()
      WidgetType.title(context, views, R.id.today_title_image, R.id.today_title, words.optString(if (day.all == 0) "empty" else "done"), WidgetType.Face.TITLE, room, 2, R.color.wgen_ink_muted)
      views.setTextViewText(R.id.today_when, "")
      views.setViewVisibility(R.id.today_when, View.GONE)
      views.setTextViewText(R.id.today_more, if (tomorrow == null) "" else "${day.data.optString("tomorrowTitle")} · ${tomorrow.optString("title")}")
      WidgetKit.tint(context, views, R.id.today_stripe, if (tomorrow == null) R.color.wgen_hairline else WidgetKit.pigment(tomorrow.optString("color")))
      val open = tomorrow?.optString("open")
      views.setOnClickPendingIntent(R.id.today_open, if (open.isNullOrEmpty()) WidgetIntents.open(context, "unlease-agenda://today", id) else WidgetIntents.route(context, open))
      return views
    }
    val runs = running(first, now)
    views.setViewVisibility(R.id.today_when, View.VISIBLE)
    views.setTextViewText(R.id.today_when, line(first, words, now, false))
    WidgetKit.textColor(context, views, R.id.today_when, if (runs) R.color.wgen_link else R.color.wgen_ink_muted)
    WidgetType.title(context, views, R.id.today_title_image, R.id.today_title, first.optString("title"), WidgetType.Face.TITLE, room, 2, R.color.wgen_ink)
    val others = day.rows.size - 1
    val place = first.optString("place")
    views.setTextViewText(R.id.today_more, if (others > 0) listOf(place, words.optString("more").replace("{count}", others.toString())).filter { it.isNotEmpty() }.joinToString(" · ") else place)
    WidgetKit.tint(context, views, R.id.today_stripe, WidgetKit.pigment(first.optString("color")))
    views.setContentDescription(R.id.today_open, listOf(first.optString("title"), line(first, words, now, true)).joinToString(", "))
    views.setOnClickPendingIntent(R.id.today_open, WidgetIntents.route(context, first.optString("open")))
    return views
  }

  private fun list(context: Context, views: RemoteViews, data: JSONObject, day: Day, words: JSONObject, now: Long, width: Float, id: Int): RemoteViews {
    // The head's paddings, the mark and its gap, and the + aside.
    WidgetType.title(context, views, R.id.today_title_image, R.id.today_title, day.data.optString("title"), WidgetType.Face.TITLE, width - 120f, 1, R.color.wgen_ink)
    val weather = day.data.optString("weather")
    views.setTextViewText(R.id.today_weather, weather)
    views.setViewVisibility(R.id.today_weather, if (weather.isEmpty()) View.GONE else View.VISIBLE)
    views.setOnClickPendingIntent(R.id.today_open, WidgetIntents.open(context, "unlease-agenda://today", id))
    views.setOnClickPendingIntent(R.id.today_add, WidgetIntents.open(context, "unlease-agenda://new", 1))

    val out = mutableListOf<Pair<Long, RemoteViews>>()
    for (row in day.rows) out += WidgetKit.key(row.optString("key")) to item(context, row, words, now)
    if (day.rows.isEmpty()) out += WidgetKit.key("today:none") to quiet(context, words.optString(if (day.all == 0) "empty" else "done"), null)
    val overdue = rows(data, "overdue")
    if (overdue.isNotEmpty()) {
      out += WidgetKit.key("head:overdue") to heading(context, data.optString("overdueTitle"))
      for (row in overdue) out += WidgetKit.key("overdue:${row.optString("key")}") to item(context, row, words, now)
    }
    val tomorrow = rows(day.data, "tomorrow")
    if (tomorrow.isNotEmpty()) {
      out += WidgetKit.key("head:tomorrow") to heading(context, day.data.optString("tomorrowTitle"))
      for (row in tomorrow) out += WidgetKit.key("tomorrow:${row.optString("key")}") to item(context, row, words, now)
      val more = day.data.optString("more")
      if (more.isNotEmpty()) out += WidgetKit.key("tomorrow:more") to quiet(context, more, day.data.optString("moreOpen"))
    }
    WidgetKit.list(views, R.id.today_list, R.id.today_static, R.id.today_empty, out, WidgetIntents.routeTemplate(context, id))
    return views
  }

  private fun heading(context: Context, text: String): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_schedule_day).apply {
        setTextViewText(R.id.day_label, text)
        WidgetKit.textColor(context, this, R.id.day_label, R.color.wgen_ink_muted)
      }

  /** A row as « Planning » draws one: its colour as a stripe, its title, its time and place; « En cours » in the accent's ink while it runs. */
  private fun item(context: Context, row: JSONObject, words: JSONObject, now: Long): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_schedule_item).apply {
        val time = line(row, words, now, true)
        setTextViewText(R.id.item_title, row.optString("title"))
        setTextViewText(R.id.item_time, time)
        WidgetKit.textColor(context, this, R.id.item_time, if (running(row, now)) R.color.wgen_link else R.color.wgen_ink_muted)
        setContentDescription(R.id.item, "${row.optString("title")}, $time")
        WidgetKit.tint(context, this, R.id.item_stripe, WidgetKit.pigment(row.optString("color")))
        setViewVisibility(R.id.item_stripe, View.VISIBLE)
        WidgetKit.route(context, this, R.id.item, row.optString("open"))
      }

  /** A quiet line: nothing (left) today, or tomorrow's rest in the link's ink, opening its day. */
  private fun quiet(context: Context, text: String, open: String?): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_today_line).apply {
        setTextViewText(R.id.line_text, text)
        WidgetKit.textColor(context, this, R.id.line_text, if (open.isNullOrEmpty()) R.color.wgen_ink_muted else R.color.wgen_link)
        WidgetKit.route(context, this, R.id.line, if (open.isNullOrEmpty()) "today" else open)
      }

  /** Draws this widget again at the next start or end it holds today (or a reminder's moment), else at midnight: inexact, never waking the phone. */
  private fun scheduleNext(context: Context, id: Int, day: Day, now: Long) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val midnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val next = day.rows.filter { !it.optBoolean("allDay") }.flatMap { listOf(it.optLong("startAt"), it.optLong("endAt")) }.filter { it > now }.minOrNull()
    val at = minOf(next ?: midnight, midnight) + 1_000
    runCatching { alarms.set(AlarmManager.RTC, at, redrawIntent(context, id)) }
  }

  private fun redrawIntent(context: Context, id: Int): PendingIntent {
    val intent =
        Intent(context, TodayWidgetProvider::class.java)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            // One alarm per widget: the data only tells them apart.
            .setData(Uri.parse("unlease-agenda://widget-today/$id"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(id))
    return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
}
