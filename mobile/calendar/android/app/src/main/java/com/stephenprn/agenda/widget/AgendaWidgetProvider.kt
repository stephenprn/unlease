package com.stephenprn.agenda.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.RemoteViews
import com.stephenprn.agenda.BuildConfig
import java.time.LocalDate
import java.time.ZoneId

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
    val name = redrawName ?: return
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    for (id in widgetIds) alarms.cancel(redrawIntent(context, id, name))
  }

  /** The name of a widget that asks to be drawn again at a moment (`redrawAt`); null for one that never does. */
  internal open val redrawName: String? = null

  /**
   * Draws this widget again at the first of `moments` still to come (a start or an end: what runs
   * changes, the now line moves), else at midnight: inexact, never waking the phone.
   */
  internal fun redrawAt(context: Context, id: Int, moments: List<Long>, now: Long) {
    val name = redrawName ?: return
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val midnight = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val at = minOf(moments.filter { it > now }.minOrNull() ?: midnight, midnight) + 1_000
    runCatching { alarms.set(AlarmManager.RTC, at, redrawIntent(context, id, name)) }
  }

  private fun redrawIntent(context: Context, id: Int, name: String): PendingIntent {
    val intent =
        Intent(context, javaClass)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            // One alarm per widget: the data only tells them apart.
            .setData(Uri.parse("${BuildConfig.APP_SCHEME}://widget-$name/$id"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(id))
    return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
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
