package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.BuildConfig
import com.stephenprn.carnet.R

/**
 * Note: one note on its own sheet. Its title opens the editor; on a checklist, « + » adds items over
 * the home screen (the quick window's `item`), without opening the app. A checklist's open items come
 * first in their order, the done ones gathered under a hairline, as the editor shows them; a tap on an
 * item ticks it here at once (`NoteRows.tickLocally`) while the app writes it (`WidgetTickReceiver`).
 */
class NoteWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id, KIND)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id, KIND)

    val list = data.optBoolean("list")
    val views = widgetViews(context, R.layout.widget_note)
    val title = data.optString("title")
    // Its paddings and the pen's slot (48) aside, and on a list the « + » (48).
    WidgetType.title(
        context,
        views,
        R.id.note_title_image,
        R.id.note_title,
        title.ifEmpty { context.getString(if (list) R.string.widget_untitled_list else R.string.widget_untitled_note) },
        WidgetType.Face.TITLE,
        WidgetType.widthDp(manager, id) - if (list) 120f else 72f,
        2,
        if (title.isEmpty()) R.color.wgen_ink_muted else R.color.wgen_ink,
        R.id.note_title_emoji,
    )
    // Drawn again over what it showed: a note without a wash takes the paper back.
    val wash = data.optString("wash").takeIf { it.isNotEmpty() && it != "null" }
    WidgetKit.wash(views, android.R.id.background, wash)
    WidgetKit.wash(views, R.id.note_fade, wash)
    views.setOnClickPendingIntent(R.id.note_open, WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://note/$target"))
    views.setViewVisibility(R.id.note_add, if (list) View.VISIBLE else View.GONE)
    if (list) views.setOnClickPendingIntent(R.id.note_add, WidgetIntents.quick(context, "item", id, target))
    views.setTextViewText(R.id.note_empty, context.getString(if (list) R.string.widget_note_empty_list else R.string.widget_note_empty_text))

    val (rows, template) = NoteRows.rows(context, id, data)
    WidgetKit.list(views, R.id.note_list, R.id.note_static, R.id.note_empty, rows, NoteRows.VIEW_TYPES, template)
    return views
  }

  private companion object {
    const val KIND = "note"
  }
}
