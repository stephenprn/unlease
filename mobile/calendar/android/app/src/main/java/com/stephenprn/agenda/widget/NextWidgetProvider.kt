package com.stephenprn.agenda.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.widget.RemoteViews
import com.stephenprn.agenda.BuildConfig
import com.stephenprn.agenda.R

/**
 * Prochain événement: what comes next, the first of the items handed over not over yet: its colour,
 * its title (in Signika), its day and time, its place. A tap opens it; with nothing ahead, the app.
 */
class NextWidgetProvider : AgendaWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val data = WidgetStore(context).payload(id) ?: return WidgetMessage.waiting(context)
    val now = System.currentTimeMillis()
    val today = WidgetKit.today()
    val items = data.optJSONArray("items")
    val next = (0 until (items?.length() ?: 0)).mapNotNull { items!!.optJSONObject(it) }.firstOrNull { it.optLong("endAt") > now }
    val views = widgetViews(context, R.layout.widget_next)
    val width = WidgetType.widthDp(manager, id)
    if (next == null) {
      WidgetType.title(context, views, R.id.next_title_image, R.id.next_title, data.optString("empty"), WidgetType.Face.TITLE, width - 40f, 2, R.color.wgen_ink_muted)
      views.setTextViewText(R.id.next_when, "")
      views.setTextViewText(R.id.next_place, "")
      WidgetKit.tint(context, views, R.id.next_stripe, R.color.wgen_hairline)
      views.setOnClickPendingIntent(R.id.next_open, WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://"))
      return views
    }
    WidgetType.title(context, views, R.id.next_title_image, R.id.next_title, next.optString("title"), WidgetType.Face.TITLE, width - 40f, 2, R.color.wgen_ink)
    val day = next.optString("day")
    val dayWords = when (day) {
      today -> context.getString(R.string.widget_today)
      WidgetKit.tomorrow() -> context.getString(R.string.widget_tomorrow)
      else -> next.optString("dayLabel")
    }
    views.setTextViewText(R.id.next_when, "$dayWords · ${next.optString("time")}")
    views.setTextViewText(R.id.next_place, next.optString("place"))
    WidgetKit.tint(context, views, R.id.next_stripe, WidgetKit.pigment(next.optString("color")))
    views.setContentDescription(R.id.next_open, "${next.optString("title")}, $dayWords ${next.optString("time")}")
    views.setOnClickPendingIntent(R.id.next_open, WidgetIntents.route(context, next.optString("open")))
    return views
  }
}
