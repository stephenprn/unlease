package com.stephenprn.clock.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.UserManager
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.clock.BuildConfig
import com.stephenprn.clock.MainActivity
import com.stephenprn.clock.R
import com.stephenprn.clock.alarm.AlarmStore
import com.stephenprn.clock.alarm.Civil
import com.stephenprn.clock.alarm.NextRing
import com.stephenprn.clock.alarm.PlannedAlarm
import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import org.json.JSONObject

/**
 * Prochaine alarme: when the next alarm rings and what waits that morning. What rings comes from the
 * alarm engine itself (its plan, what already rang, a snooze, a ring under way: `AlarmStore`), counted
 * as it arms (`NextRing`), so the widget is right with the app closed, after a restart, once an alarm
 * has rung. The morning's first event, whether it comes too soon, and the words come from JavaScript
 * (`mobile/clock/src/app/widgetPayloads.ts`), by alarm and day; a morning it has not counted shows the
 * alarm alone. Drawn again whenever the engine arms or a ring changes, and every half hour (a new day).
 * A tap opens the alarm; « + » makes one.
 */
class NextAlarmWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (id in widgetIds) draw(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    draw(context, manager, id)
  }

  /** Up to two cells wide on one row: the time over the day; three cells and more: side by side; two rows: stacked with « + »; taller: the morning under it, its event on two lines when there is room. */
  private enum class Form(val layout: Int) {
    SMALL(R.layout.widget_alarm_small),
    WIDE(R.layout.widget_alarm_wide),
    TALL(R.layout.widget_alarm),
    /** The morning under it, its event on one line. */
    MORNING(R.layout.widget_alarm),
    /** Taller still: the event on two lines. */
    FULL(R.layout.widget_alarm),
  }

  /** What rings next, as the widget says it. */
  private class Next(
      val alarm: PlannedAlarm?,
      /** The instant it rings (a snooze: when it rings again); 0 with nothing to ring. */
      val at: Long,
      val day: Long,
      val state: State,
  )

  private enum class State { RINGS, SNOOZED, RINGING, NONE, NOT_HERE }

  companion object {
    /** Draws every placed widget again (the engine armed, a ring began or ended, new words). Never before the first unlock: the launcher shows none then. */
    fun redrawAll(context: Context) {
      // The big clock shows the next alarm too.
      ClockWidgetProvider.redrawAll(context)
      try {
        if (context.getSystemService(UserManager::class.java)?.isUserUnlocked == false) return
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, NextAlarmWidgetProvider::class.java))
        if (ids.isEmpty()) return
        for (id in ids) draw(context, manager, id)
      } catch (_: Exception) {
        // A widget is never worth an alarm: whatever fails here leaves the engine alone.
      }
    }

    /** The next alarm as the big clock says it: its id, its time as the app writes it, its name; null with none to ring (or one ringing now). */
    internal fun upcoming(context: Context): Triple<String, String, String>? {
      val next = next(context)
      val alarm = next.alarm ?: return null
      if (next.state != State.RINGS && next.state != State.SNOOZED) return null
      val payload = WidgetStore(context).payload()
      return Triple(alarm.id, clock(context, Civil.wallOf(next.at, TimeZone.getDefault()).second, payload), alarm.title)
    }

    fun placed(context: Context): IntArray =
        AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, NextAlarmWidgetProvider::class.java))

    private fun draw(context: Context, manager: AppWidgetManager, id: Int) {
      val payload = WidgetStore(context).payload()
      val next = next(context)
      val width = widthDp(manager, id)
      val views =
          if (Build.VERSION.SDK_INT >= 31) {
            RemoteViews(
                mapOf(
                    SizeF(40f, 40f) to views(context, payload, next, Form.SMALL, width),
                    SizeF(200f, 40f) to views(context, payload, next, Form.WIDE, width),
                    SizeF(110f, 110f) to views(context, payload, next, Form.TALL, width),
                    SizeF(110f, 176f) to views(context, payload, next, Form.MORNING, width),
                    SizeF(110f, 190f) to views(context, payload, next, Form.FULL, width),
                ),
            )
          } else {
            val options = manager.getAppWidgetOptions(id)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
            val maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
            val form =
                when {
                  maxHeight in 1 until 110 -> if (minWidth in 1 until 200) Form.SMALL else Form.WIDE
                  maxHeight >= 190 -> Form.FULL
                  maxHeight >= 176 -> Form.MORNING
                  else -> Form.TALL
                }
            views(context, payload, next, form, width)
          }
      manager.updateAppWidget(id, views)
    }

    /** The widget's width as the launcher shows it upright, in dp (a guess until placed). */
    private fun widthDp(manager: AppWidgetManager, id: Int): Float {
      val width = manager.getAppWidgetOptions(id)?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
      return if (width > 0) width.toFloat() else 160f
    }

    /** As the engine arms: a ring under way first, then the soonest of the snoozes and each alarm's next ring after the one that rang last. */
    private fun next(context: Context): Next {
      val store = AlarmStore(context)
      val plan = store.plan()
      val now = System.currentTimeMillis()
      val zone = TimeZone.getDefault()
      store.ring()?.takeIf { it.alarm.id != AlarmStore.TEST_ID }?.let { return Next(it.alarm, it.at, Civil.dayOf(it.at, zone), State.RINGING) }
      var best: Next? = null
      for (snooze in store.snoozes()) {
        if (snooze.record.alarm.id == AlarmStore.TEST_ID || snooze.until <= now) continue
        if (best == null || snooze.until < best.at) best = Next(snooze.record.alarm, snooze.until, Civil.dayOf(snooze.record.at, zone), State.SNOOZED)
      }
      if (plan.settings.ringsHere) {
        for (alarm in plan.alarms) {
          val ring = NextRing.after(alarm, max(now, store.fired(alarm.id)), zone) ?: continue
          if (best == null || ring.at < best.at) best = Next(alarm, ring.at, ring.day, State.RINGS)
        }
      }
      return best ?: Next(null, 0L, 0L, if (plan.settings.ringsHere || plan.alarms.isEmpty()) State.NONE else State.NOT_HERE)
    }

    private fun views(context: Context, payload: JSONObject?, next: Next, form: Form, width: Float): RemoteViews {
      val words = Words(context, payload)
      val views = RemoteViews(context.packageName, form.layout)
      val alarm = next.alarm
      val zone = TimeZone.getDefault()
      val morning = alarm?.let { payload?.optJSONObject("mornings")?.optJSONObject("${it.id}|${Civil.dayKey(next.day)}") }
      val clash = morning?.optString("clash").orEmpty()
      // The instant the engine counted, as the phone's clock reads it (a time the clocks skip rings an hour later, and says so).
      val time: CharSequence = if (alarm == null) "–" else timeText(clock(context, Civil.wallOf(next.at, zone).second, payload))
      val timeInk =
          when {
            alarm == null -> R.color.wgen_ink_muted
            clash.isNotEmpty() && next.state == State.RINGS -> R.color.wgen_waiting
            else -> R.color.wgen_ink
          }
      val day =
          when (next.state) {
            State.RINGING -> words.ringing
            State.SNOOZED -> words.snoozed(clock(context, Civil.wallOf(next.at, zone).second, payload))
            State.NONE, State.NOT_HERE -> ""
            State.RINGS -> dayWords(next.day, payload, words)
          }
      val name =
          when (next.state) {
            State.NONE -> words.none
            // The sentence where it fits whole; the short words in one line, or two cells wide.
            State.NOT_HERE -> if (form == Form.SMALL || form == Form.WIDE || width < 180f) words.offHere else words.notHere
            else -> alarm?.title.orEmpty()
          }
      val event = morning?.optString("event").orEmpty()
      // Why the morning is too tight, in Safran; else how far the event stands from the alarm, or the quiet line.
      val after = clash.ifEmpty { morning?.optString("after").orEmpty() }

      when (form) {
        Form.SMALL -> {
          // A cell's height holds 28 at most; a 12-hour time steps down to 16 rather than lose its AM or PM.
          WidgetType.fitted(context, views, R.id.alarm_time_image, R.id.alarm_time, time, WidgetType.Face.TIME, width - 16f, 16f, timeInk, 28f)
          views.setTextViewText(R.id.alarm_day, day.ifEmpty { name })
          WidgetKit.textColor(context, views, R.id.alarm_day, if (next.state == State.RINGING) R.color.wgen_link else R.color.wgen_ink_muted)
        }
        Form.WIDE -> {
          // The paddings (16 each) and the gap (12) aside; the time takes at most half of the rest.
          WidgetType.fitted(context, views, R.id.alarm_time_image, R.id.alarm_time, time, WidgetType.Face.TIME, (width - 44f) / 2f, 20f, timeInk, 34f)
          views.setTextViewText(R.id.alarm_day, listOf(day, name).filter { it.isNotEmpty() }.joinToString(" · "))
          WidgetKit.textColor(context, views, R.id.alarm_day, if (next.state == State.RINGING) R.color.wgen_link else R.color.wgen_ink)
          val line = clash.ifEmpty { event }
          views.setTextViewText(R.id.alarm_after, line)
          views.setViewVisibility(R.id.alarm_after, if (line.isEmpty()) View.GONE else View.VISIBLE)
          WidgetKit.textColor(context, views, R.id.alarm_after, if (clash.isNotEmpty()) R.color.wgen_waiting else R.color.wgen_ink_muted)
        }
        Form.TALL, Form.MORNING, Form.FULL -> {
          // Two rows (110 high) hold 36; taller, the full 44.
          WidgetType.fitted(context, views, R.id.alarm_time_image, R.id.alarm_time, time, WidgetType.Face.TIME, width - 32f, 24f, timeInk, if (form == Form.TALL) 36f else 44f)
          views.setTextViewText(R.id.alarm_day, day)
          // No day to say (no alarm): the line goes, so the sentence under it has the room.
          views.setViewVisibility(R.id.alarm_day, if (day.isEmpty()) View.GONE else View.VISIBLE)
          WidgetKit.textColor(context, views, R.id.alarm_day, if (next.state == State.RINGING) R.color.wgen_link else R.color.wgen_ink_muted)
          views.setTextViewText(R.id.alarm_name, name)
          // No alarm, or none ringing here: the sentence whole, over as many lines as it takes.
          views.setInt(R.id.alarm_name, "setMaxLines", if (alarm == null) 3 else 1)
          WidgetKit.textColor(context, views, R.id.alarm_name, if (alarm == null) R.color.wgen_ink_muted else R.color.wgen_ink)
          val shown = form != Form.TALL && alarm != null && (event.isNotEmpty() || after.isNotEmpty())
          views.setViewVisibility(R.id.alarm_morning, if (shown) View.VISIBLE else View.GONE)
          if (shown) {
            views.setTextViewText(R.id.alarm_event, event)
            // The thesis line: a long title takes a second line rather than lose its end.
            views.setInt(R.id.alarm_event, "setMaxLines", if (form == Form.FULL) 2 else 1)
            views.setViewVisibility(R.id.alarm_event, if (event.isEmpty()) View.GONE else View.VISIBLE)
            views.setTextViewText(R.id.alarm_after, after)
            views.setViewVisibility(R.id.alarm_after, if (after.isEmpty()) View.GONE else View.VISIBLE)
            // Alone (the quiet line, « Rien dans votre agenda après cette alarme. »), it takes the event's two lines.
            views.setInt(R.id.alarm_after, "setMaxLines", if (event.isEmpty()) 2 else 1)
            WidgetKit.textColor(context, views, R.id.alarm_after, if (clash.isNotEmpty()) R.color.wgen_waiting else R.color.wgen_ink_muted)
            views.setImageViewResource(R.id.alarm_glyph, if (clash.isNotEmpty()) R.drawable.wgen_g_alert_waiting else R.drawable.wgen_g_today_ink_muted)
          }
          views.setContentDescription(R.id.alarm_add, words.newAlarm)
          views.setOnClickPendingIntent(R.id.alarm_add, open(context, "new", 1))
        }
      }
      // One sentence for TalkBack: what rings, when, and what waits after it.
      val said = listOf(day, if (alarm != null) time.toString() else "", if (next.state == State.NOT_HERE) words.notHere else name, event, after).filter { it.isNotEmpty() }.joinToString(", ")
      views.setContentDescription(R.id.alarm_open, said)
      views.setOnClickPendingIntent(R.id.alarm_open, if (alarm == null) open(context, "new", 2) else open(context, "alarm/${alarm.id}", 0))
      return views
    }

    /** A 12-hour time's AM or PM at half the size, in the same figure: never cut from it. */
    private fun timeText(time: String): CharSequence {
      val at = time.indexOf('\u00A0')
      if (at < 0) return time
      return android.text.SpannableString(time).apply { setSpan(android.text.style.RelativeSizeSpan(0.5f), at, time.length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
    }

    /** « Aujourd’hui », « Demain », else the day as JavaScript wrote it (« Mercredi 18 »), else as this phone does. */
    private fun dayWords(day: Long, payload: JSONObject?, words: Words): String {
      val today = Civil.dayOf(System.currentTimeMillis(), TimeZone.getDefault())
      return when (day) {
        today -> words.today
        today + 1 -> words.tomorrow
        else ->
            payload?.optJSONObject("days")?.optString(Civil.dayKey(day))?.takeIf { it.isNotEmpty() }
                ?: java.time.LocalDate.parse(Civil.dayKey(day)).format(java.time.format.DateTimeFormatter.ofPattern("EEEE d", Locale.getDefault())).replaceFirstChar { it.titlecase(Locale.getDefault()) }
      }
    }

    /** A minute of the day as the app writes a time (`07:30`, `7:30 AM`: `clockWords`). */
    private fun clock(context: Context, minute: Int, payload: JSONObject?): String {
      val hour = minute / 60
      val rest = minute % 60
      val twelve = if (payload?.has("twelveHours") == true) payload.optBoolean("twelveHours") else !android.text.format.DateFormat.is24HourFormat(context)
      if (!twelve) return String.format(Locale.ROOT, "%02d:%02d", hour, rest)
      val shown = if (hour % 12 == 0) 12 else hour % 12
      val suffix = if (hour < 12) "AM" else "PM"
      return if (rest == 0) "$shown $suffix" else String.format(Locale.ROOT, "%d:%02d %s", shown, rest, suffix)
    }

    /** `unlease-clock://<path>` in the app (RootNavigator's linking); the request code tells taps apart. */
    private fun open(context: Context, path: String, code: Int): PendingIntent {
      val intent =
          Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://$path"), context, MainActivity::class.java)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
  }

  /** The words, in the app's language as JavaScript handed them; the phone's own until it has. */
  private class Words(context: Context, payload: JSONObject?) {
    private val given = payload?.optJSONObject("words")
    private fun word(key: String, fallback: String) = given?.optString(key)?.takeIf { it.isNotEmpty() } ?: fallback

    val today = word("today", context.getString(R.string.widget_today))
    val tomorrow = word("tomorrow", context.getString(R.string.widget_tomorrow))
    val none = word("none", context.getString(R.string.widget_no_alarm))
    val notHere = word("notHere", context.getString(R.string.widget_not_here))
    /** The same, where one line is all there is. */
    val offHere = word("offHere", context.getString(R.string.widget_off_here))
    val ringing = word("ringing", context.getString(R.string.widget_ringing))
    val newAlarm = word("newAlarm", context.getString(R.string.widget_new_alarm))
    private val snoozedUntil = given?.optString("snoozed")?.takeIf { it.contains("{time}") }
    private val snoozedFallback = context.getString(R.string.widget_snoozed, "{time}")

    fun snoozed(time: String): String = (snoozedUntil ?: snoozedFallback).replace("{time}", time)
  }
}
