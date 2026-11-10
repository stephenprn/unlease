package com.stephenprn.contacts.widget

import android.content.Context
import android.widget.RemoteViews
import com.stephenprn.contacts.R

/**
 * The words a widget's layout writes itself (a hint, a button's description). The launcher resolves a
 * layout's `@string` in the phone's language, not the app's: each is written again here from the
 * app's own context, which speaks the language chosen in Réglages (the app's language for Android,
 * set by WidgetsModule). Every layout is built through [widgetViews].
 */
internal object WidgetWords {
  private enum class Kind { TEXT, DESCRIPTION }

  private data class Word(val view: Int, val kind: Kind, val string: Int)

  private fun text(view: Int, string: Int) = Word(view, Kind.TEXT, string)

  private fun said(view: Int, string: Int) = Word(view, Kind.DESCRIPTION, string)

  private val LAYOUTS: Map<Int, List<Word>> = mapOf(
    R.layout.widget_calls to listOf(
      said(R.id.calls_open, R.string.widget_calls_open),
      text(R.id.w_calls_empty_open, R.string.widget_open_app),
    ),
    R.layout.widget_add to listOf(said(R.id.add_pebble, R.string.widget_new_contact)),
    R.layout.widget_add_wide to listOf(
      said(R.id.add_strip, R.string.widget_new_contact),
      text(R.id.add_hint, R.string.widget_new_contact),
    ),
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
