package com.stephenprn.clock.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.clock.R
import java.util.TimeZone
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import org.json.JSONObject

/**
 * Horloges: the cities JavaScript handed (`tools.cities`, west to east), each one's time counting by
 * itself (a TextClock set to its zone), the sun or the moon as it is there (counted from where it is,
 * as `daylight` in `@unlease/clock/services/worldClocks` counts it), « Demain · +8 h ». The words
 * that change with the hour are drawn again at each quarter hour (an inexact alarm that never wakes
 * the phone) and every half hour. One or two cells: the first city alone, large.
 */
class WorldClocksWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) draw(context, manager, id)
    later(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    draw(context, manager, id)
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_TICK) {
      redrawAll(context)
      return
    }
    super.onReceive(context, intent)
  }

  override fun onDisabled(context: Context) {
    context.getSystemService(AlarmManager::class.java)?.cancel(tick(context))
  }

  companion object {
    private const val ACTION_TICK = "com.stephenprn.clock.widget.WORLD_TICK"
    private const val HEAD = 56
    private const val ROW = 52
    private const val QUARTER = 15 * 60_000L

    fun redrawAll(context: Context) {
      ToolWidgets.redraw(context, WorldClocksWidgetProvider::class.java, ::draw)
      if (ToolWidgets.placed(context, WorldClocksWidgetProvider::class.java).isNotEmpty()) later(context)
    }

    private fun tick(context: Context): PendingIntent =
        PendingIntent.getBroadcast(context, 60, Intent(context, WorldClocksWidgetProvider::class.java).setAction(ACTION_TICK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** The next quarter hour, when the phone is awake anyway: a city's day or its daylight may turn then. */
    private fun later(context: Context) {
      val now = System.currentTimeMillis()
      context.getSystemService(AlarmManager::class.java)?.set(AlarmManager.RTC, (now / QUARTER + 1) * QUARTER + 2_000L, tick(context))
    }

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val (width, height) = ToolWidgets.size(manager, id, 250, 180)
      val cities = ToolWidgets.array(context, "cities")
      val now = System.currentTimeMillis()
      val pattern = ToolWidgets.clockPattern(context)
      if (width < 180 || height < 100) {
        val views = RemoteViews(context.packageName, R.layout.widget_world_one)
        val city = cities.optJSONObject(0)
        if (city == null) {
          views.setTextViewText(R.id.one_name, ToolWidgets.word(context, "addCity", R.string.widget_add_city))
          views.setViewVisibility(R.id.one_clock, View.GONE)
          views.setViewVisibility(R.id.one_sky, View.GONE)
          views.setViewVisibility(R.id.one_meta, View.GONE)
          views.setOnClickPendingIntent(R.id.world_open, ToolWidgets.open(context, "world/new", 61))
        } else {
          val zone = city.optString("zone")
          clock(views, R.id.one_clock, zone, pattern)
          views.setTextViewTextSize(R.id.one_clock, android.util.TypedValue.COMPLEX_UNIT_SP, if (width < 110) 24f else 30f)
          views.setTextViewText(R.id.one_name, city.optString("name"))
          views.setImageViewResource(R.id.one_sky, sky(city, now))
          views.setTextViewText(R.id.one_meta, meta(context, zone, now))
          views.setViewVisibility(R.id.one_meta, if (height < 80) View.GONE else View.VISIBLE)
          views.setContentDescription(R.id.world_open, said(context, city, now))
          views.setOnClickPendingIntent(R.id.world_open, ToolWidgets.open(context, "world", 62))
        }
        manager.updateAppWidget(id, views)
        return
      }
      val views = RemoteViews(context.packageName, R.layout.widget_world)
      val title = ToolWidgets.word(context, "worldClocks", R.string.widget_world_label)
      WidgetType.title(context, views, R.id.world_title_image, R.id.world_title, title, WidgetType.Face.TITLE, (width - 80).toFloat(), 1, R.color.wgen_ink)
      views.setOnClickPendingIntent(R.id.world_head, ToolWidgets.open(context, "world", 63))
      views.setContentDescription(R.id.world_add, ToolWidgets.word(context, "addCity", R.string.widget_add_city))
      views.setOnClickPendingIntent(R.id.world_add, ToolWidgets.open(context, "world/new", 64))
      views.removeAllViews(R.id.world_list)
      var room = height - HEAD
      for (index in 0 until cities.length()) {
        if (room < ROW) break
        val city = cities.optJSONObject(index) ?: continue
        val row = RemoteViews(context.packageName, R.layout.widget_world_row)
        val zone = city.optString("zone")
        row.setTextViewText(R.id.city_name, city.optString("name"))
        row.setTextViewText(R.id.city_meta, meta(context, zone, now))
        row.setImageViewResource(R.id.city_sky, sky(city, now))
        clock(row, R.id.city_clock, zone, pattern)
        row.setContentDescription(R.id.city_row, said(context, city, now))
        row.setOnClickPendingIntent(R.id.city_row, ToolWidgets.open(context, "world", 65))
        views.addView(R.id.world_list, row)
        room -= ROW
      }
      views.setViewVisibility(R.id.world_empty, if (cities.length() == 0) View.VISIBLE else View.GONE)
      views.setTextViewText(R.id.world_empty, ToolWidgets.word(context, "noCities", R.string.widget_no_cities))
      manager.updateAppWidget(id, views)
    }

    /** A TextClock showing a zone's time in the app's format, whatever the phone's own. */
    private fun clock(views: RemoteViews, viewId: Int, zone: String, pattern: String) {
      views.setString(viewId, "setTimeZone", zone)
      views.setCharSequence(viewId, "setFormat24Hour", pattern)
      views.setCharSequence(viewId, "setFormat12Hour", pattern)
    }

    /** « Demain · +8 h », « Aujourd’hui · −5 h 30 », « Même heure ». */
    private fun meta(context: Context, zone: String, now: Long): String {
      val there = TimeZone.getTimeZone(zone)
      val here = TimeZone.getDefault()
      val offset = (there.getOffset(now) - here.getOffset(now)) / 60_000
      val dayThere = Math.floorDiv(now + there.getOffset(now), 86_400_000L)
      val dayHere = Math.floorDiv(now + here.getOffset(now), 86_400_000L)
      val day =
          when {
            dayThere > dayHere -> ToolWidgets.word(context, "tomorrow", R.string.widget_tomorrow)
            dayThere < dayHere -> ToolWidgets.word(context, "yesterday", R.string.widget_yesterday)
            else -> ToolWidgets.word(context, "today", R.string.widget_today)
          }
      if (offset == 0) return "$day · ${ToolWidgets.word(context, "sameTime", R.string.widget_same_time)}"
      val sign = if (offset > 0) "+" else "−"
      val whole = kotlin.math.abs(offset)
      val hours = whole / 60
      val minutes = whole % 60
      val gap = if (hours == 0) "$minutes min" else if (minutes == 0) "$hours h" else "$hours h ${"%02d".format(minutes)}"
      return "$day · $sign$gap"
    }

    private fun said(context: Context, city: JSONObject, now: Long): String = "${city.optString("name")}, ${meta(context, city.optString("zone"), now)}"

    /** The sun or the moon there: from where the city is (the sun's height, as `sunAltitude` counts it), else from the hour there. */
    private fun sky(city: JSONObject, now: Long): Int {
      val day =
          if (city.has("lat") && !city.isNull("lat") && city.has("lon") && !city.isNull("lon")) sunAltitude(city.optDouble("lat"), city.optDouble("lon"), now) > -0.83
          else {
            val there = TimeZone.getTimeZone(city.optString("zone"))
            val hour = Math.floorMod((now + there.getOffset(now)) / 3_600_000L, 24L)
            hour in 7..18
          }
      return if (day) R.drawable.wgen_g_sun_ink_muted else R.drawable.wgen_g_moon_ink_muted
    }

    /** The sun's height at a place and an instant, in degrees: `sunAltitude` in `@unlease/clock/services/worldClocks`, number for number. */
    private fun sunAltitude(lat: Double, lon: Double, at: Long): Double {
      val rad = PI / 180
      val days = at / 86_400_000.0 - 10_957.5
      val meanLongitude = (280.46 + 0.9856474 * days) % 360
      val meanAnomaly = ((357.528 + 0.9856003 * days) % 360) * rad
      val eclipticLongitude = (meanLongitude + 1.915 * sin(meanAnomaly) + 0.02 * sin(2 * meanAnomaly)) * rad
      val obliquity = (23.439 - 0.0000004 * days) * rad
      val declination = asin(sin(obliquity) * sin(eclipticLongitude))
      val rightAscension = atan2(cos(obliquity) * sin(eclipticLongitude), cos(eclipticLongitude))
      val sidereal = (280.46061837 + 360.98564736629 * days + lon) % 360
      val hourAngle = sidereal * rad - rightAscension
      return asin(sin(lat * rad) * sin(declination) + cos(lat * rad) * cos(declination) * cos(hourAngle)) / rad
    }
  }
}
