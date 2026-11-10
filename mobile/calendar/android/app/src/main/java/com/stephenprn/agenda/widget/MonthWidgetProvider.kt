package com.stephenprn.agenda.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.agenda.R
import org.json.JSONObject

/**
 * Mois: this month's grid, the weekdays' initials above, today on the primary's pebble, a dot under
 * the days holding something (in the colour of the first). A day opens that day in the app; the head
 * opens the month.
 */
class MonthWidgetProvider : AgendaWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val data = WidgetStore(context).payload(id) ?: return WidgetMessage.waiting(context)
    val today = WidgetKit.today()
    val months = data.optJSONArray("months") ?: return WidgetMessage.waiting(context)
    val all = (0 until months.length()).mapNotNull { months.optJSONObject(it) }
    val month = all.firstOrNull { it.optString("month").take(7) == today.take(7) } ?: all.firstOrNull() ?: return WidgetMessage.waiting(context)
    val views = widgetViews(context, R.layout.widget_month)
    WidgetType.title(context, views, R.id.month_title_image, R.id.month_title, month.optString("title"), WidgetType.Face.TITLE, WidgetType.widthDp(manager, id) - 40f, 1, R.color.wgen_ink)
    views.setOnClickPendingIntent(R.id.month_open, WidgetIntents.open(context, "unlease-agenda://?view=month&day=$today"))

    views.removeAllViews(R.id.month_weekdays)
    val weekdays = data.optJSONArray("weekdays")
    for (i in 0 until (weekdays?.length() ?: 0)) {
      views.addView(R.id.month_weekdays, RemoteViews(context.packageName, R.layout.widget_month_label).apply { setTextViewText(R.id.label, weekdays!!.optString(i)) })
    }
    views.removeAllViews(R.id.month_weeks)
    val weeks = month.optJSONArray("weeks")
    for (w in 0 until (weeks?.length() ?: 0)) {
      val week = weeks!!.optJSONArray(w) ?: continue
      val row = RemoteViews(context.packageName, R.layout.widget_month_week)
      for (d in 0 until week.length()) row.addView(R.id.week, cell(context, week.optJSONObject(d) ?: continue, today))
      views.addView(R.id.month_weeks, row)
    }
    return views
  }

  private fun cell(context: Context, cell: JSONObject, today: String): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_month_cell).apply {
        val day = cell.optString("day")
        val isToday = day == today
        setTextViewText(R.id.cell_number, cell.optInt("number").toString())
        WidgetKit.textColor(context, this, R.id.cell_number, if (isToday) R.color.wgen_on_leaf else if (cell.optBoolean("inMonth")) R.color.wgen_ink else R.color.wgen_ink_muted)
        setViewVisibility(R.id.cell_today, if (isToday) View.VISIBLE else View.INVISIBLE)
        val busy = cell.optInt("count") > 0 && !isToday
        setViewVisibility(R.id.cell_dot, if (busy) View.VISIBLE else View.INVISIBLE)
        if (busy) WidgetKit.tint(context, this, R.id.cell_dot, WidgetKit.pigment(cell.optString("color")))
        setContentDescription(R.id.cell, day)
        setOnClickPendingIntent(R.id.cell, WidgetIntents.open(context, "unlease-agenda://day/$day", day.hashCode()))
      }
}
