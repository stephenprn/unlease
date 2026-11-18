package com.stephenprn.carnet.widget

import android.app.PendingIntent
import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.util.TypedValue
import android.widget.RemoteViews
import com.stephenprn.carnet.BuildConfig
import com.stephenprn.carnet.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * A note drawn whole on a widget (a note widget, a lists widget): a checklist's open items first in
 * their order, the done ones gathered under a hairline as the editor shows them, each ticked by a tap;
 * or a text note's paragraphs, each opening it.
 *
 * The launcher reuses a row drawn for one item to draw another (a list's rows are recycled, and a
 * widget drawn again is applied over what it showed): every row sets all it shows, its box, its ink
 * and its words, or an item left open would keep the box of the done one drawn there before.
 */
internal object NoteRows {
  /** The rows of [note] (`WidgetNote`), and the template their taps fill in: ticks for a list, the note for a text. */
  fun rows(context: Context, widgetId: Int, note: JSONObject): Pair<List<Pair<Long, RemoteViews>>, PendingIntent> =
      if (note.optBoolean("list")) checklist(context, widgetId, note) to WidgetIntents.tickTemplate(context, widgetId)
      else lines(context, note) to WidgetIntents.routeTemplate(context, widgetId)

  /** A list's row kinds: an item, the done ones' head; a text's paragraph. */
  const val VIEW_TYPES = 3

  private fun checklist(context: Context, widgetId: Int, note: JSONObject): List<Pair<Long, RemoteViews>> {
    val items = note.optJSONArray("items") ?: return emptyList()
    val all = (0 until items.length()).mapNotNull { items.optJSONObject(it) }
    val open = all.filter { !it.optBoolean("checked") }
    val done = all.filter { it.optBoolean("checked") }
    val rows = open.map { WidgetKit.key(it.optString("id")) to check(context, widgetId, it, false) }.toMutableList()
    if (done.isNotEmpty()) {
      rows +=
          WidgetKit.key("done:${note.optString("id")}") to
              widgetViews(context, R.layout.widget_note_done).apply {
                setTextViewText(R.id.done_count, context.resources.getQuantityString(R.plurals.widget_checked, done.size, done.size))
              }
      rows += done.map { WidgetKit.key(it.optString("id")) to check(context, widgetId, it, true) }
    }
    return rows
  }

  private fun check(context: Context, widgetId: Int, item: JSONObject, checked: Boolean): RemoteViews =
      widgetViews(context, R.layout.widget_note_check).apply {
        val text = item.optString("text")
        if (checked) {
          // Done: struck through in the second ink, its box filled in it, as the editor shows it.
          val struck = SpannableString(text)
          struck.setSpan(StrikethroughSpan(), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          setTextViewText(R.id.check_text, struck)
          WidgetKit.textColor(context, this, R.id.check_text, R.color.wgen_ink_muted)
          setImageViewResource(R.id.check_box, R.drawable.wgen_check_done)
        } else {
          setTextViewText(R.id.check_text, text)
          WidgetKit.textColor(context, this, R.id.check_text, R.color.wgen_ink)
          setImageViewResource(R.id.check_box, R.drawable.wgen_check_open)
        }
        val indent = if (item.optInt("indent") > 0) 32 else 8
        setViewPadding(R.id.check, dp(context, indent), dp(context, 4), dp(context, 10), dp(context, 4))
        setContentDescription(R.id.check, context.getString(if (checked) R.string.widget_untick else R.string.widget_tick, text))
        val checkId = item.optString("id")
        if (WidgetKit.listsTakeFillIns) setOnClickFillInIntent(R.id.check, WidgetIntents.tickFill(checkId, !checked))
        else setOnClickPendingIntent(R.id.check, WidgetIntents.tick(context, widgetId, checkId, !checked))
      }

  private fun lines(context: Context, note: JSONObject): List<Pair<Long, RemoteViews>> {
    val id = note.optString("id")
    val lines = note.optJSONArray("lines") ?: return emptyList()
    return (0 until lines.length()).map { index ->
      WidgetKit.key("$id:$index") to
          widgetViews(context, R.layout.widget_note_line).apply {
            setTextViewText(R.id.line, lines.optString(index))
            WidgetKit.route(context, this, R.id.line, "${BuildConfig.APP_SCHEME}://note/$id")
          }
    }
  }

  /** The note a widget's picture draws: the picture itself (a note widget), or the one it shows (a lists widget). */
  fun noteOf(payload: JSONObject): JSONObject? = if (payload.optString("kind") == "lists") payload.optJSONObject("note") else payload

  /** The items a widget's picture shows, to tick. */
  private fun itemsOf(payload: JSONObject): JSONArray? = noteOf(payload)?.optJSONArray("items")

  /** True when widget `widgetId` shows item `checkId` now: a tick names nothing else (`WidgetTickReceiver`). */
  fun shows(context: Context, widgetId: Int, checkId: String): Boolean {
    if (checkId.isEmpty()) return false
    val items = WidgetStore(context).payload(widgetId)?.let { itemsOf(it) } ?: return false
    return (0 until items.length()).any { items.optJSONObject(it)?.optString("id") == checkId }
  }

  /** A tick drawn at once on every widget showing that item, before the app has written it. */
  fun tickLocally(context: Context, checkId: String, checked: Boolean) {
    val store = WidgetStore(context)
    for (provider in listOf(NoteWidgetProvider::class.java, ListsWidgetProvider::class.java)) {
      for (id in Widgets.ids(context, provider)) {
        val data = store.payload(id) ?: continue
        val items = itemsOf(data) ?: continue
        var found = false
        for (i in 0 until items.length()) {
          val item = items.optJSONObject(i) ?: continue
          if (item.optString("id") == checkId) {
            item.put("checked", checked)
            found = true
          }
        }
        if (!found) continue
        store.setPayload(id, data.toString())
        Widgets.redraw(context, id)
      }
    }
  }

  fun dp(context: Context, value: Int): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics).toInt()
}
