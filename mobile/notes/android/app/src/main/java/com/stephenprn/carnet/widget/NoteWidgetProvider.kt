package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R
import org.json.JSONObject

/**
 * Note: one note on its own sheet. Its title opens the editor. A checklist's open items come first in
 * their order, the done ones gathered under a hairline, as the editor shows them; a tap on an item
 * ticks it here at once (`tickLocally`) while the app writes it (`WidgetTickReceiver`).
 */
class NoteWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id, KIND)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id, KIND)

    val list = data.optBoolean("list")
    val views = RemoteViews(context.packageName, R.layout.widget_note)
    val title = data.optString("title")
    // Its paddings and the edit glyph (20) aside; an untitled note says what it is, in the second ink.
    WidgetType.title(
        context,
        views,
        R.id.note_title_image,
        R.id.note_title,
        title.ifEmpty { context.getString(if (list) R.string.widget_untitled_list else R.string.widget_untitled_note) },
        WidgetType.Face.TITLE,
        WidgetType.widthDp(manager, id) - 60f,
        2,
        if (title.isEmpty()) R.color.wgen_ink_muted else R.color.wgen_ink,
    )
    val wash = data.optString("wash").takeIf { it.isNotEmpty() && it != "null" }
    WidgetKit.wash(views, R.id.note_root, wash)
    WidgetKit.wash(views, R.id.note_fade, wash)
    views.setOnClickPendingIntent(R.id.note_open, WidgetIntents.open(context, "carnet://note/$target"))
    views.setTextViewText(R.id.note_empty, context.getString(if (list) R.string.widget_note_empty_list else R.string.widget_note_empty_text))

    val rows = if (list) checklist(context, id, data) else lines(context, target, data)
    val template = if (list) WidgetIntents.tickTemplate(context, id) else WidgetIntents.routeTemplate(context, id)
    WidgetKit.list(views, R.id.note_list, R.id.note_static, R.id.note_empty, rows, 3, template)
    return views
  }

  private fun checklist(context: Context, id: Int, data: JSONObject): List<Pair<Long, RemoteViews>> {
    val items = data.optJSONArray("items") ?: return emptyList()
    val all = (0 until items.length()).mapNotNull { items.optJSONObject(it) }
    val open = all.filter { !it.optBoolean("checked") }
    val done = all.filter { it.optBoolean("checked") }
    val rows = open.map { WidgetKit.key(it.optString("id")) to check(context, id, it, false) }.toMutableList()
    if (done.isNotEmpty()) {
      rows +=
          WidgetKit.key("done:${data.optString("id")}") to
              RemoteViews(context.packageName, R.layout.widget_note_done).apply {
                setTextViewText(R.id.done_count, context.resources.getQuantityString(R.plurals.widget_checked, done.size, done.size))
              }
      rows += done.map { WidgetKit.key(it.optString("id")) to check(context, id, it, true) }
    }
    return rows
  }

  private fun check(context: Context, widgetId: Int, item: JSONObject, checked: Boolean): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_note_check).apply {
        val text = item.optString("text")
        if (checked) {
          // Done: struck through in the second ink, its box ticked, as the editor shows it.
          val struck = SpannableString(text)
          struck.setSpan(StrikethroughSpan(), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
          setTextViewText(R.id.check_text, struck)
          WidgetKit.textColor(context, this, R.id.check_text, R.color.wgen_ink_muted)
          setImageViewResource(R.id.check_box, R.drawable.wgen_g_box_checked_ink_muted)
        } else {
          setTextViewText(R.id.check_text, text)
        }
        val indent = if (item.optInt("indent") > 0) 32 else 8
        setViewPadding(R.id.check, dp(context, indent), dp(context, 4), dp(context, 10), dp(context, 4))
        setContentDescription(R.id.check, context.getString(if (checked) R.string.widget_untick else R.string.widget_tick, text))
        val checkId = item.optString("id")
        if (WidgetKit.listsTakeFillIns) setOnClickFillInIntent(R.id.check, WidgetIntents.tickFill(checkId, !checked))
        else setOnClickPendingIntent(R.id.check, WidgetIntents.tick(context, widgetId, checkId, !checked))
      }

  private fun lines(context: Context, target: String, data: JSONObject): List<Pair<Long, RemoteViews>> {
    val lines = data.optJSONArray("lines") ?: return emptyList()
    return (0 until lines.length()).map { index ->
      WidgetKit.key("$target:$index") to
          RemoteViews(context.packageName, R.layout.widget_note_line).apply {
            setTextViewText(R.id.line, lines.optString(index))
            WidgetKit.route(context, this, R.id.line, "carnet://note/$target")
          }
    }
  }

  private fun dp(context: Context, value: Int): Int =
      TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics).toInt()

  companion object {
    private const val KIND = "note"

    /** A tick drawn at once on every widget showing that item, before the app has written it. */
    internal fun tickLocally(context: Context, checkId: String, checked: Boolean) {
      val store = WidgetStore(context)
      for (id in Widgets.ids(context, NoteWidgetProvider::class.java)) {
        val data = store.payload(id) ?: continue
        val items = data.optJSONArray("items") ?: continue
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
}
