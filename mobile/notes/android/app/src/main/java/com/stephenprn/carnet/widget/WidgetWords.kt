package com.stephenprn.carnet.widget

import android.content.Context
import android.widget.RemoteViews
import com.stephenprn.carnet.R

/**
 * The words a widget's layout writes itself (a hint, a short label, a button's description). The
 * launcher resolves a layout's `@string` in the phone's language, not the app's: each is written
 * again here from the app's own context, which speaks the language chosen in Réglages (the app's
 * language for Android, set by WidgetsModule). Every layout is built through [widgetViews].
 */
internal object WidgetWords {
  private enum class Kind { TEXT, DESCRIPTION }

  private data class Word(val view: Int, val kind: Kind, val string: Int)

  private fun text(view: Int, string: Int) = Word(view, Kind.TEXT, string)

  private fun said(view: Int, string: Int) = Word(view, Kind.DESCRIPTION, string)

  private val QUICK = listOf(
    said(R.id.quick_search, R.string.widget_search),
    said(R.id.quick_checklist, R.string.widget_checklist),
    said(R.id.quick_photo, R.string.widget_photo),
    said(R.id.quick_camera, R.string.widget_camera),
    said(R.id.quick_link, R.string.widget_link),
    said(R.id.quick_reminder, R.string.widget_reminder),
    said(R.id.quick_note, R.string.widget_note),
  )

  private val LAYOUTS: Map<Int, List<Word>> = mapOf(
    R.layout.widget_quick to QUICK,
    R.layout.widget_quick_tall to QUICK + listOf(
      text(R.id.quick_search_hint, R.string.widget_search_hint),
      text(R.id.w_short_checklist, R.string.widget_short_checklist),
      text(R.id.w_short_photo, R.string.widget_short_photo),
      text(R.id.w_short_camera, R.string.widget_short_camera),
      text(R.id.w_short_link, R.string.widget_short_link),
      text(R.id.w_short_reminder, R.string.widget_short_reminder),
      text(R.id.w_short_note, R.string.widget_short_note),
    ),
    R.layout.widget_link to listOf(
      said(R.id.link_strip, R.string.widget_link),
      text(R.id.link_hint, R.string.widget_link),
    ),
    R.layout.widget_link_small to listOf(said(R.id.link_pebble, R.string.widget_link)),
    R.layout.widget_collection to listOf(
      said(R.id.collection_pick, R.string.widget_collection_pick),
      said(R.id.collection_add, R.string.widget_collection_add),
      text(R.id.w_collection_empty, R.string.widget_collection_empty),
      text(R.id.w_collection_add, R.string.widget_collection_add),
    ),
    R.layout.widget_collection_more to listOf(text(R.id.w_collection_open, R.string.widget_collection_open)),
    R.layout.widget_collection_row to listOf(said(R.id.row_open, R.string.widget_open_site)),
    R.layout.widget_label to listOf(
      said(R.id.label_open, R.string.widget_label_open),
      said(R.id.label_new_list, R.string.widget_checklist),
      said(R.id.label_new_note, R.string.widget_note),
      text(R.id.w_label_empty, R.string.widget_label_empty),
      text(R.id.w_label_create, R.string.widget_label_create),
    ),
    R.layout.widget_note to listOf(said(R.id.note_open, R.string.widget_note_open)),
  )

  fun write(context: Context, views: RemoteViews, layout: Int) {
    for (word in LAYOUTS[layout] ?: return) {
      val words = context.getString(word.string)
      when (word.kind) {
        Kind.TEXT -> views.setTextViewText(word.view, words)
        Kind.DESCRIPTION -> views.setContentDescription(word.view, words)
      }
    }
  }
}

/** A widget's layout, its own words in the app's language. */
internal fun widgetViews(context: Context, layout: Int): RemoteViews =
  RemoteViews(context.packageName, layout).also { WidgetWords.write(context, it, layout) }
