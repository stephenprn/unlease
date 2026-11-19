package com.stephenprn.carnet.widget

import android.app.PendingIntent
import android.content.Context
import android.content.res.ColorStateList
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R

/** What every widget draws with: tints by day and at night, a collection's stone, a scrolling list. */
internal object WidgetKit {
  /** Rows a list shows at most where it cannot scroll (Android 11 and older). */
  private const val STILL_ROWS = 6

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

  /**
   * A sheet worn in a wash: its paper tinted; none, the paper (a widget drawn again, or a list's row
   * reused, keeps the tint it had otherwise). Older launchers keep the paper.
   */
  fun wash(views: RemoteViews, viewId: Int, wash: String?) {
    if (Build.VERSION.SDK_INT < 31) return
    val color = wash?.let { WidgetRes.washes[it] }
    if (color != null) views.setColorStateList(viewId, "setBackgroundTintList", color)
    else views.setColorStateList(viewId, "setBackgroundTintList", null as ColorStateList?)
  }

  /** A collection's emblem lying on its stone, the stone in its wash, turned its own way. */
  fun stone(context: Context, views: RemoteViews, stoneId: Int, emblemId: Int, emblem: String, color: String, turn: Int) {
    views.setImageViewResource(stoneId, WidgetRes.stones[Math.floorMod(turn, WidgetRes.stones.size)])
    views.setImageViewResource(emblemId, WidgetRes.emblems[emblem] ?: R.drawable.wgen_emblem_bac)
    tint(context, views, stoneId, WidgetRes.washes[color] ?: R.color.wgen_wash_grey)
    tint(context, views, emblemId, WidgetRes.pigments[color] ?: R.color.wgen_pigment_grey)
  }

  /** Stable ids for a list's rows, from the records' own. */
  fun key(id: String): Long = id.hashCode().toLong() and 0xffffffffL

  /**
   * Hands `rows` to the list `listId` (its taps on `template`, `viewTypes` the row layouts they use), then a
   * clear foot, so what it shows last scrolls up out of the fade at the sheet's foot; before Android 12,
   * the first ones to `stillId`.
   */
  fun list(views: RemoteViews, listId: Int, stillId: Int, emptyId: Int, rows: List<Pair<Long, RemoteViews>>, viewTypes: Int, template: PendingIntent) {
    views.setViewVisibility(emptyId, if (rows.isEmpty()) View.VISIBLE else View.GONE)
    if (Build.VERSION.SDK_INT >= 31) {
      val items = RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(viewTypes + 1)
      for ((key, row) in rows) items.addItem(key, row)
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

  /** Whether a row's taps are fill-ins on its list's template (Android 12 and later) or PendingIntents of their own. */
  val listsTakeFillIns: Boolean
    get() = Build.VERSION.SDK_INT >= 31

  /** A row opening `uri` (a page of the app or a website) when `viewId` is tapped. */
  fun route(context: Context, row: RemoteViews, viewId: Int, uri: String) {
    if (listsTakeFillIns) row.setOnClickFillInIntent(viewId, WidgetIntents.routeFill(uri))
    else row.setOnClickPendingIntent(viewId, WidgetIntents.route(context, uri))
  }
}
