package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.BuildConfig
import com.stephenprn.carnet.R

/**
 * Listes d'un label: a task widget. Its label is chosen as it is placed; its head is the selector, the
 * note shown (its title and a chevron, the label's tag and name, what is left to do under it), a tap
 * picking another of the label's notes over the home screen (the quick window's `lists`). « + » adds
 * items to a list without opening the app, the pen opens the note; the note itself is drawn as a note
 * widget draws it (`NoteRows`), its items ticked right here.
 *
 * Its target is `<label>/<note>` (the label alone until a note is picked); JavaScript shows the note
 * picked while it still wears the label, else the label's first (`listsPayload`).
 */
class ListsWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id, KIND)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id, KIND)

    val views = widgetViews(context, R.layout.widget_lists)
    val note = data.optJSONObject("note")
    val list = note?.optBoolean("list") == true
    val width = WidgetType.widthDp(manager, id)
    // The pen where the head has room for it beside the selector and « + ».
    val open = note != null && width >= OPEN_WIDTH_DP
    val buttons = (if (list) 48f else 0f) + (if (open) 48f else 0f)

    // The head: the note's title (an untitled one says what it is, in the second ink), else the label's name.
    val title = note?.optString("title").orEmpty()
    val shown =
        when {
          note == null -> data.optString("name")
          title.isNotEmpty() -> title
          else -> context.getString(if (list) R.string.widget_untitled_list else R.string.widget_untitled_note)
        }
    // Beside its paddings (6, 10, 8), the chevron (20) and the buttons.
    val titled = WidgetType.title(context, views, R.id.lists_title_image, R.id.lists_title, shown, WidgetType.Face.TITLE, width - 50f - buttons, 1, if (note != null && title.isEmpty()) R.color.wgen_ink_muted else R.color.wgen_ink, R.id.lists_title_emoji)
    views.setViewVisibility(R.id.lists_chevron, if (titled) View.VISIBLE else View.GONE)
    val meta = data.optString("meta")
    views.setTextViewText(R.id.lists_meta, meta)
    views.setViewVisibility(R.id.lists_meta_row, if (meta.isEmpty()) View.GONE else View.VISIBLE)
    WidgetKit.tint(context, views, R.id.lists_tag, WidgetRes.pigments[data.optString("color")] ?: R.color.wgen_pigment_grey)
    views.setOnClickPendingIntent(R.id.lists_pick, WidgetIntents.quick(context, KIND, id, target))

    // Drawn again over another note: one without a wash takes the paper back.
    val wash = note?.optString("wash")?.takeIf { it.isNotEmpty() && it != "null" }
    WidgetKit.wash(views, android.R.id.background, wash)
    WidgetKit.wash(views, R.id.lists_fade, wash)

    val noteId = note?.optString("id").orEmpty()
    val add = if (list) WidgetIntents.quick(context, "item", id, noteId) else null
    views.setViewVisibility(R.id.lists_open, if (open) View.VISIBLE else View.GONE)
    views.setViewVisibility(R.id.lists_add, if (add != null) View.VISIBLE else View.GONE)
    if (open) views.setOnClickPendingIntent(R.id.lists_open, WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://note/$noteId"))
    if (add != null) views.setOnClickPendingIntent(R.id.lists_add, add)

    // Nothing to show: a label wearing no note yet (a new list is a tap away, in the app), an empty list
    // (its « + » again), or an empty note.
    val (empty, action) =
        when {
          note == null -> R.string.widget_label_empty to R.string.widget_checklist
          list -> R.string.widget_note_empty_list to R.string.widget_note_add
          else -> R.string.widget_note_empty_text to null
        }
    views.setTextViewText(R.id.lists_empty_text, context.getString(empty))
    views.setViewVisibility(R.id.lists_empty_add, if (action != null) View.VISIBLE else View.GONE)
    if (action != null) {
      views.setTextViewText(R.id.lists_empty_action, context.getString(action))
      val label = data.optString("label")
      views.setOnClickPendingIntent(R.id.lists_empty_add, add ?: WidgetIntents.quick(context, "new", id, "checklist/$label"))
    }

    val (rows, template) = if (note != null) NoteRows.rows(context, id, note) else emptyList<Pair<Long, RemoteViews>>() to WidgetIntents.routeTemplate(context, id)
    WidgetKit.list(views, R.id.lists_list, R.id.lists_static, R.id.lists_empty, rows, NoteRows.VIEW_TYPES, template)
    return views
  }

  private companion object {
    const val KIND = "lists"
    /** Narrower, the head keeps the selector and « + »; the note opens from the app. */
    const val OPEN_WIDTH_DP = 220f
  }
}
