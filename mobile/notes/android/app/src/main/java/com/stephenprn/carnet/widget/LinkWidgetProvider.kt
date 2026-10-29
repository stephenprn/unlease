package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.R

/**
 * Classer un lien: a tap opens the field over the home screen (the quick window), filled from the
 * clipboard when it holds a link; Claude reads it and files it. The sparkle shows while the server reads links.
 */
class LinkWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val open = WidgetIntents.quick(context, "link", id)
    val reading = WidgetStore(context).shared().optBoolean("reading", true)
    val strip =
        RemoteViews(context.packageName, R.layout.widget_link).apply {
          setViewVisibility(R.id.link_sparkle, if (reading) View.VISIBLE else View.GONE)
          // Its paddings, the link glyph and, while Claude reads, the sparkle aside.
          val room = WidgetType.widthDp(manager, id) - if (reading) 100f else 70f
          WidgetType.title(context, this, R.id.link_hint_image, R.id.link_hint, context.getString(R.string.widget_link), WidgetType.Face.HINT, room, 1, R.color.wgen_ink_muted)
          setOnClickPendingIntent(R.id.link_strip, open)
        }
    val pebble = RemoteViews(context.packageName, R.layout.widget_link_small).apply { setOnClickPendingIntent(R.id.link_pebble, open) }
    if (Build.VERSION.SDK_INT >= 31) return RemoteViews(mapOf(SizeF(40f, 40f) to pebble, SizeF(150f, 40f) to strip))
    return if (manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) < 150) pebble else strip
  }
}
