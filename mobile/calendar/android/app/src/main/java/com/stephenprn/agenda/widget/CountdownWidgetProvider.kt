package com.stephenprn.agenda.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.widget.RemoteViews
import com.stephenprn.agenda.R
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.json.JSONObject

/**
 * Compte à rebours: the days left until one event, chosen in the quick window as it is placed (and
 * again from the launcher). The count is worked out here as it draws, from today on this phone and
 * the day of the first occurrence not over among those JavaScript handed over, so it turns with the
 * half-hourly draw even when the app is not opened: « J-12 », « J-1 » (« Demain » and its time
 * under it), « Aujourd’hui » in the accent's ink on its day, « En cours » on the later days of a
 * longer one, then « J+3 » in muted ink once it has gone by. Its colour is a stripe (a dot, one cell
 * wide); a tap opens it in the app. In the bin or gone, it says so, and a tap chooses another.
 */
class CountdownWidgetProvider : AgendaWidgetProvider() {

  /** One cell: the count and the title under it; one row: side by side; two rows and more: stacked. */
  private enum class Form(val layout: Int) {
    SMALL(R.layout.widget_countdown_small),
    WIDE(R.layout.widget_countdown_wide),
    TALL(R.layout.widget_countdown),
  }

  /** What the widget says today: the count, its ink, the line under the title, and what a tap opens. */
  private class Count(val words: String, val ink: Int, val line: String, val open: String)

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    if (store.target(id).isEmpty()) return WidgetMessage.choose(context, id)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id)
    val count = count(context, data) ?: return WidgetMessage.gone(context, id)
    val width = WidgetType.widthDp(manager, id)
    if (Build.VERSION.SDK_INT >= 31) {
      return RemoteViews(
          mapOf(
              SizeF(40f, 40f) to views(context, data, count, Form.SMALL, width, id),
              SizeF(130f, 40f) to views(context, data, count, Form.WIDE, width, id),
              SizeF(110f, 100f) to views(context, data, count, Form.TALL, width, id),
          ),
      )
    }
    val options = manager.getAppWidgetOptions(id)
    val form =
        when {
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) in 1 until 130 -> Form.SMALL
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) >= 100 -> Form.TALL
          else -> Form.WIDE
        }
    return views(context, data, count, form, width, id)
  }

  /** The occurrence counted to (the first not over, else the last, gone by) and the days from today to it. */
  private fun count(context: Context, data: JSONObject): Count? {
    val list = data.optJSONArray("occurrences") ?: return null
    val all = (0 until list.length()).mapNotNull { list.optJSONObject(it) }
    val now = System.currentTimeMillis()
    val shown = all.firstOrNull { it.optLong("endAt") > now } ?: all.lastOrNull() ?: return null
    val day = runCatching { LocalDate.parse(shown.optString("day")) }.getOrNull() ?: return null
    val last = runCatching { LocalDate.parse(shown.optString("lastDay")) }.getOrNull() ?: day
    val today = LocalDate.now()
    val left = ChronoUnit.DAYS.between(today, day).toInt()
    val open = shown.optString("open")
    return when {
      left > 1 -> Count(context.getString(R.string.widget_countdown_before, left), R.color.wgen_ink, shown.optString("when"), open)
      left == 1 -> {
        val time = shown.optString("time")
        val tomorrow = context.getString(R.string.widget_tomorrow)
        Count(context.getString(R.string.widget_countdown_before, left), R.color.wgen_ink, if (time.isEmpty()) tomorrow else "$tomorrow · $time", open)
      }
      left == 0 -> Count(context.getString(R.string.widget_today), R.color.wgen_link, shown.optString("onDay"), open)
      !today.isAfter(last) -> Count(context.getString(R.string.widget_countdown_ongoing), R.color.wgen_link, shown.optString("onDay"), open)
      else -> Count(context.getString(R.string.widget_countdown_after, -left), R.color.wgen_ink_muted, shown.optString("when"), open)
    }
  }

  private fun views(context: Context, data: JSONObject, count: Count, form: Form, width: Float, id: Int): RemoteViews {
    val views = widgetViews(context, form.layout)
    val title = data.optString("title")
    val color = WidgetKit.pigment(data.optString("color"))
    when (form) {
      Form.SMALL -> {
        // Its paddings aside; a long word (« Aujourd’hui ») set smaller to fit.
        WidgetType.fitted(context, views, R.id.countdown_count_image, R.id.countdown_count, count.words, WidgetType.Face.COUNT, width - 16f, 18f, count.ink)
        views.setTextViewText(R.id.countdown_title, title)
        WidgetKit.tint(context, views, R.id.countdown_dot, color)
      }
      Form.WIDE -> {
        // The paddings (12 each), the stripe (5) and two gaps (12 each) aside; the count takes at most half of the rest.
        val room = width - 53f
        val taken = WidgetType.fitted(context, views, R.id.countdown_count_image, R.id.countdown_count, count.words, WidgetType.Face.COUNT, room / 2f, 20f, count.ink)
        WidgetType.title(context, views, R.id.countdown_title_image, R.id.countdown_title, title, WidgetType.Face.TITLE, room - taken, 1, R.color.wgen_ink)
        views.setTextViewText(R.id.countdown_when, count.line)
        WidgetKit.tint(context, views, R.id.countdown_stripe, color)
      }
      Form.TALL -> {
        // The paddings (12 each), the stripe (5) and its gap (12) aside.
        val room = width - 41f
        WidgetType.fitted(context, views, R.id.countdown_count_image, R.id.countdown_count, count.words, WidgetType.Face.COUNT, room, 20f, count.ink)
        WidgetType.title(context, views, R.id.countdown_title_image, R.id.countdown_title, title, WidgetType.Face.TITLE, room, 2, R.color.wgen_ink)
        views.setTextViewText(R.id.countdown_when, count.line)
        WidgetKit.tint(context, views, R.id.countdown_stripe, color)
      }
    }
    views.setContentDescription(R.id.countdown_open, listOf(count.words, title, count.line).filter { it.isNotEmpty() }.joinToString(", "))
    views.setOnClickPendingIntent(R.id.countdown_open, WidgetIntents.open(context, "unlease-agenda://${count.open}", id))
    return views
  }
}
