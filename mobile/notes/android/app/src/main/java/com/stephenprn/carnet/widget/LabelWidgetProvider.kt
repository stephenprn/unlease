package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R
import org.json.JSONObject

/**
 * Notes d'un label: the label's notes as the board shows them (pinned first), each its own sheet; a
 * card opens the note in the editor. The head opens the label in the app; the list and the capture
 * pebble start a note wearing it.
 */
class LabelWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id, KIND)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id, KIND)

    val views = RemoteViews(context.packageName, R.layout.widget_label)
    // Beside the tag (24) and its paddings, the list button (48) and the capture pebble (50).
    WidgetType.title(context, views, R.id.label_name_image, R.id.label_name, data.optString("name"), WidgetType.Face.TITLE, WidgetType.widthDp(manager, id) - 168f, 1, R.color.wgen_ink)
    views.setContentDescription(R.id.label_open, data.optString("name"))
    WidgetKit.tint(context, views, R.id.label_tag, WidgetRes.pigments[data.optString("color")] ?: R.color.wgen_pigment_grey)
    views.setOnClickPendingIntent(R.id.label_open, WidgetIntents.open(context, "carnet://label/$target"))
    views.setOnClickPendingIntent(R.id.label_new_list, WidgetIntents.open(context, "carnet://capture/checklist?label=$target"))
    val newNote = WidgetIntents.open(context, "carnet://capture/note?label=$target")
    views.setOnClickPendingIntent(R.id.label_new_note, newNote)
    views.setOnClickPendingIntent(R.id.label_empty_add, newNote)

    val notes = data.optJSONArray("notes")
    val rows = mutableListOf<Pair<Long, RemoteViews>>()
    for (i in 0 until (notes?.length() ?: 0)) {
      val note = notes!!.optJSONObject(i) ?: continue
      rows += WidgetKit.key(note.optString("id")) to card(context, note)
    }
    WidgetKit.list(views, R.id.label_list, R.id.label_static, R.id.label_empty, rows, 1, WidgetIntents.routeTemplate(context, id))
    return views
  }

  private fun card(context: Context, note: JSONObject): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_label_card).apply {
        val title = note.optString("title")
        val body = note.optString("body")
        val more = note.optString("more")
        setTextViewText(R.id.card_title, title)
        setViewVisibility(R.id.card_title, if (title.isEmpty()) View.GONE else View.VISIBLE)
        setTextViewText(R.id.card_body, body)
        setViewVisibility(R.id.card_body, if (body.isEmpty()) View.GONE else View.VISIBLE)
        // A title over words: the body starts a little below it, as on a card of the board.
        if (title.isNotEmpty() && body.isNotEmpty()) setViewPadding(R.id.card_body, 0, dp(context, 2), 0, 0)
        setTextViewText(R.id.card_more, more)
        setViewVisibility(R.id.card_more, if (more.isEmpty()) View.GONE else View.VISIBLE)
        removeAllViews(R.id.card_items)
        val items = note.optJSONArray("items")
        for (i in 0 until (items?.length() ?: 0)) {
          val item = items!!.optJSONObject(i) ?: continue
          addView(
              R.id.card_items,
              RemoteViews(context.packageName, R.layout.widget_label_item).apply {
                setTextViewText(R.id.item_text, item.optString("text"))
                if (item.optInt("indent") > 0) setViewPadding(R.id.item, dp(context, 20), 0, 0, 0)
              },
          )
        }
        if (items != null && items.length() > 0 && title.isNotEmpty()) setViewPadding(R.id.card_items, 0, dp(context, 4), 0, 0)
        WidgetKit.wash(this, R.id.card, note.optString("wash").takeIf { it.isNotEmpty() && it != "null" })
        setContentDescription(R.id.card, title.ifEmpty { body.take(80) })
        // A collection opens on its own page, never as a note (JavaScript says which).
        WidgetKit.route(context, this, R.id.card, "carnet://${note.optString("open").ifEmpty { "note/${note.optString("id")}" }}")
      }

  private fun dp(context: Context, value: Int): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics).toInt()

  private companion object {
    const val KIND = "label"
  }
}
