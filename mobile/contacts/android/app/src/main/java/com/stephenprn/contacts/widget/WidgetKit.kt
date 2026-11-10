package com.stephenprn.contacts.widget

import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.contacts.R

/** What every widget draws with: tints by day and at night, and a grid of faces. */
internal object WidgetKit {
  /** Rows of faces shown at most where a grid cannot scroll (Android 11 and older). */
  private const val STILL_ROWS = 3
  /** A face's cell, as `widget_calls_cell.xml` lays it. */
  private const val CELL_DP = 76f

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

  /** Stable ids for a grid's cells, from the records' own. */
  fun key(id: String): Long = id.hashCode().toLong() and 0xffffffffL

  /** Whether a cell's taps are fill-ins on its grid's template (Android 12 and later) or PendingIntents of their own. */
  val gridsTakeFillIns: Boolean
    get() = Build.VERSION.SDK_INT >= 31

  /** A cell of widget `widgetId` going to `uri` (`WidgetRouterActivity`'s) when `viewId` is tapped. */
  fun route(context: Context, widgetId: Int, cell: RemoteViews, viewId: Int, uri: String) {
    if (gridsTakeFillIns) cell.setOnClickFillInIntent(viewId, WidgetIntents.routeFill(uri))
    else cell.setOnClickPendingIntent(viewId, WidgetIntents.route(context, widgetId, uri))
  }

  /**
   * Hands `cells` to the grid `gridId` (its taps on `template`); before Android 12, where a grid needs
   * a service, the first rows of them laid in `stillId`, as many to a row as `widthDp` holds.
   */
  fun grid(context: Context, views: RemoteViews, gridId: Int, stillId: Int, emptyId: Int, cells: List<Pair<Long, RemoteViews>>, widthDp: Float, template: PendingIntent) {
    views.setViewVisibility(emptyId, if (cells.isEmpty()) View.VISIBLE else View.GONE)
    if (Build.VERSION.SDK_INT >= 31) {
      val items = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1)
      for ((key, cell) in cells) items.addItem(key, cell)
      views.setRemoteAdapter(gridId, items.build())
      views.setPendingIntentTemplate(gridId, template)
      views.setViewVisibility(gridId, if (cells.isEmpty()) View.GONE else View.VISIBLE)
      views.setViewVisibility(stillId, View.GONE)
    } else {
      views.setViewVisibility(gridId, View.GONE)
      views.removeAllViews(stillId)
      val columns = ((widthDp - 16f) / CELL_DP).toInt().coerceAtLeast(1)
      for (row in cells.chunked(columns).take(STILL_ROWS)) {
        val line = RemoteViews(context.packageName, R.layout.widget_calls_row)
        for ((_, cell) in row) line.addView(R.id.row, cell)
        views.addView(stillId, line)
      }
      views.setViewVisibility(stillId, if (cells.isEmpty()) View.GONE else View.VISIBLE)
    }
  }
}
