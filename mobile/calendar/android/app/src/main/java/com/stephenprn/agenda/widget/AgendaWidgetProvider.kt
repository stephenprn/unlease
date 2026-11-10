package com.stephenprn.agenda.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.RemoteViews

/**
 * A home-screen widget: it draws from what the store holds (JavaScript hands it over, `WidgetsModule`).
 * Its info asks the launcher to update it every half hour: the picture holds a few days more than it
 * shows, so each draw starts from today and drops what ended, even when the app was not opened.
 */
abstract class AgendaWidgetProvider : AppWidgetProvider() {
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

/** Every widget, by the kind JavaScript knows it as, and how to draw any one again. */
internal object Widgets {
  val KINDS: List<Pair<String, Class<out AgendaWidgetProvider>>> =
      listOf(
          "schedule" to ScheduleWidgetProvider::class.java,
          "month" to MonthWidgetProvider::class.java,
          "next" to NextWidgetProvider::class.java,
          "countdown" to CountdownWidgetProvider::class.java,
          "today" to TodayWidgetProvider::class.java,
      )

  /** The kinds pointed at something in the quick window (a countdown, at its event). */
  val POINTED: Set<String> = setOf("countdown")

  private val PROVIDERS: List<AgendaWidgetProvider> = listOf(ScheduleWidgetProvider(), MonthWidgetProvider(), NextWidgetProvider(), CountdownWidgetProvider(), TodayWidgetProvider())

  fun ids(context: Context, provider: Class<out AgendaWidgetProvider>): IntArray =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, provider))

  /** The kind of a placed widget the quick window points (`countdown`), or null when it is not one. */
  fun pointedKindOf(context: Context, id: Int): String? {
    val name = AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className ?: return null
    return KINDS.firstOrNull { it.second.name == name }?.first?.takeIf { it in POINTED }
  }

  fun redraw(context: Context, id: Int) {
    val manager = AppWidgetManager.getInstance(context)
    val name = manager.getAppWidgetInfo(id)?.provider?.className ?: return
    val provider = PROVIDERS.firstOrNull { it.javaClass.name == name } ?: return
    manager.updateAppWidget(id, provider.draw(context, manager, id))
  }

  fun redrawEverything(context: Context) {
    for (provider in PROVIDERS) for (id in ids(context, provider.javaClass)) redraw(context, id)
  }
}
