package com.stephenprn.agenda.widget

import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.agenda.R
import java.time.LocalDate

/** What every widget draws with: tints by day and at night, today on this phone, and a list of rows. */
internal object WidgetKit {
  /** Rows shown at most where a list cannot scroll (Android 11 and older). */
  private const val STILL_ROWS = 8

  /**
   * The row layouts a list may hold at once (a day's heading, an item, a quiet line, the now line, the
   * clear foot): Android refuses a list holding more layouts than its count, and keeps the count across draws.
   */
  private const val ROW_KINDS = 5

  /** Tints an image with a colour resource, as the launcher shows it: by day or at night. */
  fun tint(context: Context, views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(viewId, "setImageTintList", color)
    else views.setInt(viewId, "setColorFilter", context.getColor(color))
  }

  /** A text's colour from a resource, so it follows the launcher from day to night. */
  fun textColor(context: Context, views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(viewId, "setTextColor", color)
    else views.setTextColor(viewId, context.getColor(color))
  }

  /** A pigment key's colour resource; for none the accent's ink, as the app paints an event of no colour. */
  fun pigment(key: String): Int = WidgetRes.pigments[key] ?: com.stephenprn.agenda.R.color.wgen_link

  /** Stable ids for a list's rows, from their keys. */
  fun key(id: String): Long = id.hashCode().toLong() and 0xffffffffL

  /** `2026-11-02`, today on this phone. */
  fun today(): String = LocalDate.now().toString()

  fun tomorrow(): String = LocalDate.now().plusDays(1).toString()

  /** The now line among today's rows, read out as `label`. */
  fun nowLine(context: Context, label: String): RemoteViews =
      RemoteViews(context.packageName, com.stephenprn.agenda.R.layout.widget_now_line).apply { setContentDescription(com.stephenprn.agenda.R.id.now, label) }

  /**
   * Where today's now line lies among `rows` (as the app's lists place it): before the first with a
   * time (`startAt` of a timed one) that starts after `now`, else after the last; null when none of
   * them has a time.
   */
  fun <T> nowLineAt(rows: List<T>, now: Long, startOf: (T) -> Long?): Int? {
    val starts = rows.map(startOf)
    if (starts.none { it != null }) return null
    val next = starts.indexOfFirst { it != null && it > now }
    return if (next < 0) rows.size else next
  }

  /** A row opening `uri` when `viewId` is tapped: a fill-in on its list's template (Android 12 and later), or a PendingIntent of its own. */
  fun route(context: Context, row: RemoteViews, viewId: Int, uri: String) {
    if (Build.VERSION.SDK_INT >= 31) row.setOnClickFillInIntent(viewId, WidgetIntents.routeFill(uri))
    else row.setOnClickPendingIntent(viewId, WidgetIntents.route(context, uri))
  }

  /**
   * Hands `rows` to the list `listId` (its taps on `template`); before Android 12, where a list needs a
   * service, the first of them laid in `stillId`.
   */
  fun list(views: RemoteViews, listId: Int, stillId: Int, emptyId: Int, rows: List<Pair<Long, RemoteViews>>, template: PendingIntent) {
    views.setViewVisibility(emptyId, if (rows.isEmpty()) View.VISIBLE else View.GONE)
    if (Build.VERSION.SDK_INT >= 31) {
      val items = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(ROW_KINDS)
      for ((key, row) in rows) items.addItem(key, row)
      // A clear last row: what the list shows last scrolls up out of the fade at the slab's foot.
      if (rows.isNotEmpty()) items.addItem(key("foot"), RemoteViews(views.`package`, R.layout.widget_list_foot))
      views.setRemoteAdapter(listId, items.build())
      views.setPendingIntentTemplate(listId, template)
      views.setViewVisibility(listId, if (rows.isEmpty()) View.GONE else View.VISIBLE)
      views.setViewVisibility(stillId, View.GONE)
    } else {
      views.setViewVisibility(listId, View.GONE)
      views.removeAllViews(stillId)
      for ((_, row) in rows.take(STILL_ROWS)) views.addView(stillId, row)
      views.setViewVisibility(stillId, if (rows.isEmpty()) View.GONE else View.VISIBLE)
    }
  }
}
