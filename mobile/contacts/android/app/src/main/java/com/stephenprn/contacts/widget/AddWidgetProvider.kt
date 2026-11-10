package com.stephenprn.contacts.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.widget.RemoteViews
import com.stephenprn.contacts.R

/**
 * Nouveau contact: one tap opens the form, ready to type (`unlease-contacts://new`). In one cell the
 * capture pebble alone, flat on the home screen; wider, a strip that says it.
 */
class AddWidgetProvider : ContactsWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    if (Build.VERSION.SDK_INT >= 31) {
      return RemoteViews(mapOf(SizeF(40f, 40f) to small(context), SizeF(150f, 40f) to wide(context, manager, id)))
    }
    val width = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    return if (width >= 150) wide(context, manager, id) else small(context)
  }

  private fun small(context: Context): RemoteViews =
      widgetViews(context, R.layout.widget_add).apply { setOnClickPendingIntent(R.id.add_pebble, WidgetIntents.open(context, NEW)) }

  private fun wide(context: Context, manager: AppWidgetManager, id: Int): RemoteViews =
      widgetViews(context, R.layout.widget_add_wide).apply {
        // The strip's paddings and its glyph (24) aside.
        WidgetType.title(context, this, R.id.add_hint_image, R.id.add_hint, context.getString(R.string.widget_new_contact), WidgetType.Face.HINT, WidgetType.widthDp(manager, id) - 72f, 1, R.color.wgen_ink_muted)
        setOnClickPendingIntent(R.id.add_strip, WidgetIntents.open(context, NEW))
      }

  private companion object {
    const val NEW = "unlease-contacts://new"
  }
}
