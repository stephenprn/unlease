package com.stephenprn.carnet.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R

/** A widget that cannot show its notes: not chosen yet, not handed over yet, or gone. One line and what a tap does. */
internal object WidgetMessage {
  private val CHOOSE = mapOf("collection" to R.string.widget_choose_collection, "label" to R.string.widget_choose_label, "note" to R.string.widget_choose_note)
  private val GONE = mapOf("collection" to R.string.widget_gone_collection, "label" to R.string.widget_gone_label, "note" to R.string.widget_gone_note)

  /** Nothing chosen: a tap opens the picker. */
  fun choose(context: Context, id: Int, kind: String): RemoteViews =
      message(context, context.getString(CHOOSE.getValue(kind)), null).apply {
        setOnClickPendingIntent(R.id.message_root, WidgetIntents.quick(context, kind, id))
      }

  /** Chosen, but the app has not drawn it yet (just restored, or never opened since): a tap opens the app, which hands it over. */
  fun waiting(context: Context): RemoteViews =
      message(context, context.getString(R.string.widget_waiting), null).apply {
        setOnClickPendingIntent(R.id.message_root, WidgetIntents.open(context, "carnet://"))
      }

  /** Its collection, label or note is gone: another one is a tap away. */
  fun gone(context: Context, id: Int, kind: String): RemoteViews =
      message(context, context.getString(GONE.getValue(kind)), context.getString(R.string.widget_choose_other)).apply {
        setOnClickPendingIntent(R.id.message_root, WidgetIntents.quick(context, kind, id))
      }

  private fun message(context: Context, text: String, action: String?): RemoteViews =
      RemoteViews(context.packageName, R.layout.widget_message).apply {
        setTextViewText(R.id.message_text, text)
        setViewVisibility(R.id.message_action, if (action == null) View.GONE else View.VISIBLE)
        if (action != null) setTextViewText(R.id.message_action, action)
      }
}
