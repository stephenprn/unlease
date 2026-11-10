package com.stephenprn.agenda.widget

import android.content.Context
import android.widget.RemoteViews
import com.stephenprn.agenda.R

/**
 * The words a widget's layout writes itself (a button's description, an empty line). The launcher
 * resolves a layout's `@string` in the phone's language, not the app's: each is written again here
 * from the app's own context, which speaks the language chosen in Réglages (the app's language for
 * Android, set by WidgetsModule). Every layout is built through [widgetViews].
 */
internal object WidgetWords {
  private enum class Kind { TEXT, DESCRIPTION }

  private data class Word(val view: Int, val kind: Kind, val string: Int)

  private fun text(view: Int, string: Int) = Word(view, Kind.TEXT, string)

  private fun said(view: Int, string: Int) = Word(view, Kind.DESCRIPTION, string)

  private val LAYOUTS: Map<Int, List<Word>> = mapOf(
    R.layout.widget_schedule to listOf(
      said(R.id.schedule_open, R.string.widget_open_app),
      said(R.id.schedule_add, R.string.widget_new_event),
      text(R.id.schedule_empty, R.string.widget_nothing),
    ),
    R.layout.widget_month to listOf(said(R.id.month_open, R.string.widget_open_app)),
    R.layout.widget_next to listOf(said(R.id.next_open, R.string.widget_open_app)),
    R.layout.widget_countdown to listOf(said(R.id.countdown_open, R.string.widget_open_app)),
    R.layout.widget_countdown_wide to listOf(said(R.id.countdown_open, R.string.widget_open_app)),
    R.layout.widget_countdown_small to listOf(said(R.id.countdown_open, R.string.widget_open_app)),
    R.layout.widget_today to listOf(
      said(R.id.today_open, R.string.widget_open_today),
      said(R.id.today_add, R.string.widget_new_event),
      text(R.id.today_empty, R.string.widget_nothing_today),
    ),
    R.layout.widget_today_small to listOf(said(R.id.today_open, R.string.widget_open_today)),
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
