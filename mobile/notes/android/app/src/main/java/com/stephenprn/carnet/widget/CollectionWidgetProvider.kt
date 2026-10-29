package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R
import org.json.JSONObject

/**
 * Collection: its links still to do, as its page lists them, each picture in its 4:5 frame. The head is
 * the selector (a tap picks another collection over the home screen); "+" adds a link to this one
 * without opening the app. A row opens the link's page in the app; its end, the website.
 */
class CollectionWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id, KIND)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id, KIND)

    val views = RemoteViews(context.packageName, R.layout.widget_collection)
    // Beside the stone (44) and its paddings, and the "+" (48): what is left for the name and its chevron.
    val titled = WidgetType.title(context, views, R.id.collection_title_image, R.id.collection_title, data.optString("title"), WidgetType.Face.TITLE, WidgetType.widthDp(manager, id) - 152f, 1, R.color.wgen_ink)
    views.setViewVisibility(R.id.collection_chevron, if (titled) View.VISIBLE else View.GONE)
    views.setTextViewText(R.id.collection_count, data.optString("count"))
    WidgetKit.stone(context, views, R.id.collection_stone, R.id.collection_emblem, data.optString("emblem"), data.optString("color"), data.optInt("turn"))
    views.setOnClickPendingIntent(R.id.collection_pick, WidgetIntents.quick(context, KIND, id, target))
    val add = WidgetIntents.quick(context, "link", id, target)
    views.setOnClickPendingIntent(R.id.collection_add, add)
    views.setOnClickPendingIntent(R.id.collection_empty_add, add)

    val links = data.optJSONArray("links")
    val rows = mutableListOf<Pair<Long, RemoteViews>>()
    val pictures = mutableListOf<String>()
    for (i in 0 until (links?.length() ?: 0)) {
      val link = links!!.optJSONObject(i) ?: continue
      rows += WidgetKit.key(link.optString("id")) to row(context, link, pictures)
    }
    if (rows.isNotEmpty()) rows += WidgetKit.key("more:$target") to more(context, target, data.optString("done"))
    WidgetKit.list(views, R.id.collection_list, R.id.collection_static, R.id.collection_empty, rows, 2, WidgetIntents.routeTemplate(context, id))
    Thumbnails.fetch(context, pictures, store.shared().optJSONObject("server"))
    return views
  }

  private fun row(context: Context, link: JSONObject, pictures: MutableList<String>): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_collection_row).apply {
        val reading = link.optBoolean("reading")
        setTextViewText(R.id.row_source, if (reading) context.getString(R.string.widget_reading) else link.optString("source"))
        setTextViewText(R.id.row_title, link.optString("title"))
        setImageViewResource(R.id.row_kind, WidgetRes.kinds[link.optString("kind")] ?: R.drawable.wgen_g_globe_ink_muted)
        val image = link.optString("image").takeIf { it.isNotEmpty() && it != "null" }
        val picture = image?.let { Thumbnails.cached(context, it) }
        if (picture != null) {
          setImageViewBitmap(R.id.row_picture, picture)
          setViewVisibility(R.id.row_picture, View.VISIBLE)
          setViewVisibility(R.id.row_kind, View.GONE)
        } else if (image != null) {
          pictures += image
        }
        setContentDescription(R.id.row_body, listOf(link.optString("title"), link.optString("source")).filter { it.isNotEmpty() }.joinToString(", "))
        WidgetKit.route(context, this, R.id.row_body, "carnet://link/${link.optString("id")}")
        WidgetKit.route(context, this, R.id.row_open, link.optString("url"))
      }

  private fun more(context: Context, target: String, done: String): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_collection_more).apply {
        setTextViewText(R.id.more_done, done)
        WidgetKit.route(context, this, R.id.more_open, "carnet://line/$target")
      }

  private companion object {
    const val KIND = "collection"
  }
}
