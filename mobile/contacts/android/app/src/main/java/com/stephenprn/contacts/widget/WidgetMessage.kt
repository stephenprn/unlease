package com.stephenprn.contacts.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.contacts.R

/** A widget that cannot show its contacts: not chosen yet, not handed over yet, or its label gone. One line and what a tap does. */
internal object WidgetMessage {
  /** Nothing chosen: a tap opens the picker. */
  fun choose(context: Context, id: Int): RemoteViews =
      message(context, context.getString(R.string.widget_choose_calls), null).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.quick(context, id))
      }

  /** Chosen, but the app has not drawn it yet (just restored, or never opened since): a tap opens the app, which hands it over. */
  fun waiting(context: Context): RemoteViews =
      message(context, context.getString(R.string.widget_waiting), null).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.open(context, "unlease-contacts://"))
      }

  /** Its label is gone: other contacts are a tap away. */
  fun gone(context: Context, id: Int): RemoteViews =
      message(context, context.getString(R.string.widget_gone_label), context.getString(R.string.widget_choose_other)).apply {
        setOnClickPendingIntent(android.R.id.background, WidgetIntents.quick(context, id))
      }

  private fun message(context: Context, text: String, action: String?): RemoteViews =
      widgetViews(context, R.layout.widget_message).apply {
        setTextViewText(R.id.message_text, text)
        setViewVisibility(R.id.message_action, if (action == null) View.GONE else View.VISIBLE)
        if (action != null) setTextViewText(R.id.message_action, action)
      }
}
