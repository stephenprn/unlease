package com.stephenprn.agenda.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.agenda.R

/**
 * A widget that cannot show what it is for: not drawn yet, a countdown with no event chosen, or its
 * event gone. One line, what a tap does, and its action when it has one.
 */
internal object WidgetMessage {
  /** Not drawn yet (just placed or restored, the app never opened since): a tap opens the app, which hands it over. */
  fun waiting(context: Context): RemoteViews =
      message(context, context.getString(R.string.widget_waiting), null).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(context, "unlease-agenda://"))
      }

  /** A countdown with no event chosen (its placing left half way): a tap opens the picker. */
  fun choose(context: Context, id: Int): RemoteViews =
      message(context, context.getString(R.string.widget_choose_event), null).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.quick(context, id))
      }

  /** Its event is in the bin or gone: another is a tap away. */
  fun gone(context: Context, id: Int): RemoteViews =
      message(context, context.getString(R.string.widget_gone_event), context.getString(R.string.widget_choose_other)).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.quick(context, id))
      }

  private fun message(context: Context, text: String, action: String?): RemoteViews =
      widgetViews(context, R.layout.widget_message).apply {
        setTextViewText(R.id.message_text, text)
        setViewVisibility(R.id.message_action, if (action == null) View.GONE else View.VISIBLE)
        if (action != null) setTextViewText(R.id.message_action, action)
      }
}
