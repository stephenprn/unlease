package com.stephenprn.agenda.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.agenda.BuildConfig
import com.stephenprn.agenda.R
import org.json.JSONObject

/**
 * Planning: the next two weeks, day by day, on a slab of the ground. Each day under its heading
 * (« Aujourd'hui », « Demain », or its date), each item a row: its colour, title, time and place; a
 * tap opens it (an event in the app, a note's reminder in Carnet, a page in Pages). The head opens
 * the app, its + a new event. Days gone and items over are left out as it draws.
 */
class ScheduleWidgetProvider : AgendaWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val data = WidgetStore(context).payload(id) ?: return WidgetMessage.waiting(context)
    val views = widgetViews(context, R.layout.widget_schedule)
    val width = WidgetType.widthDp(manager, id)
    WidgetType.title(context, views, R.id.schedule_title_image, R.id.schedule_title, data.optString("title"), WidgetType.Face.TITLE, width - 120f, 1, R.color.wgen_ink)
    views.setOnClickPendingIntent(R.id.schedule_open, WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://"))
    views.setOnClickPendingIntent(R.id.schedule_add, WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://new", 1))
    views.setTextViewText(R.id.schedule_empty, data.optString("empty").ifEmpty { context.getString(R.string.widget_nothing) })

    val today = WidgetKit.today()
    val tomorrow = WidgetKit.tomorrow()
    val now = System.currentTimeMillis()
    val rows = mutableListOf<Pair<Long, RemoteViews>>()
    val days = data.optJSONArray("days")
    for (i in 0 until (days?.length() ?: 0)) {
      val day = days!!.optJSONObject(i) ?: continue
      val date = day.optString("day")
      if (date < today) continue
      val items = day.optJSONArray("items") ?: continue
      val shown = (0 until items.length()).mapNotNull { items.optJSONObject(it) }.filter { it.optLong("endAt") > now }
      if (shown.isEmpty()) continue
      val heading = when (date) {
        today -> "${data.optString("today")} · ${day.optString("label")}"
        tomorrow -> "${data.optString("tomorrow")} · ${day.optString("label")}"
        else -> day.optString("label")
      }
      rows += WidgetKit.key("day:$date") to heading(context, heading, date == today)
      for (item in shown) rows += WidgetKit.key(item.optString("key")) to item(context, item)
    }
    WidgetKit.list(views, R.id.schedule_list, R.id.schedule_static, R.id.schedule_empty, rows, WidgetIntents.routeTemplate(context, id))
    return views
  }

  private fun heading(context: Context, text: String, today: Boolean): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_schedule_day).apply {
        setTextViewText(R.id.day_label, text)
        WidgetKit.textColor(context, this, R.id.day_label, if (today) R.color.wgen_link else R.color.wgen_ink_muted)
      }

  private fun item(context: Context, item: JSONObject): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_schedule_item).apply {
        setTextViewText(R.id.item_title, item.optString("title"))
        val place = item.optString("place")
        setTextViewText(R.id.item_time, if (place.isEmpty()) item.optString("time") else "${item.optString("time")} · $place")
        setContentDescription(R.id.item, "${item.optString("title")}, ${item.optString("time")}")
        WidgetKit.tint(context, this, R.id.item_stripe, WidgetKit.pigment(item.optString("color")))
        setViewVisibility(R.id.item_stripe, View.VISIBLE)
        WidgetKit.route(context, this, R.id.item, item.optString("open"))
      }
}
