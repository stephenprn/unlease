package com.stephenprn.contacts.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews

/**
 * A home-screen widget: it draws from what the store holds (JavaScript hands it over, `WidgetsModule`)
 * and has no update period; the launcher asks again when it is placed, resized or the app updated.
 */
abstract class ContactsWidgetProvider : AppWidgetProvider() {
  internal abstract fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews

  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) manager.updateAppWidget(id, draw(context, manager, id))
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, draw(context, manager, id))
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    WidgetStore(context).forget(widgetIds)
  }
}

/** Every widget, by what it shows: the kinds whose data JavaScript hands over, and how to draw any one again. */
internal object Widgets {
  /** The widgets showing contacts, by the kind JavaScript knows them as. */
  val DATA_KINDS: List<Pair<String, Class<out ContactsWidgetProvider>>> = listOf("calls" to CallsWidgetProvider::class.java)

  private val PROVIDERS: List<ContactsWidgetProvider> = listOf(CallsWidgetProvider(), AddWidgetProvider())

  fun ids(context: Context, provider: Class<out ContactsWidgetProvider>): IntArray =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, provider))

  /** The kind (`calls`) of a placed widget, or null when it is not one of those. */
  fun kindOf(context: Context, id: Int): String? {
    val name = AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className ?: return null
    return DATA_KINDS.firstOrNull { it.second.name == name }?.first
  }

  fun redraw(context: Context, id: Int) {
    val manager = AppWidgetManager.getInstance(context)
    val name = manager.getAppWidgetInfo(id)?.provider?.className ?: return
    val provider = PROVIDERS.firstOrNull { it.javaClass.name == name } ?: return
    manager.updateAppWidget(id, provider.draw(context, manager, id))
  }

  fun redrawAll(context: Context, provider: Class<out ContactsWidgetProvider>) {
    for (id in ids(context, provider)) redraw(context, id)
  }

  fun redrawEverything(context: Context) {
    for (provider in PROVIDERS) redrawAll(context, provider.javaClass)
  }
}
