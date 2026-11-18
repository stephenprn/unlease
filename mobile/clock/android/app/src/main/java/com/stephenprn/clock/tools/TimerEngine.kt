package com.stephenprn.clock.tools

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.stephenprn.clock.BuildConfig
import com.stephenprn.clock.MainActivity
import com.stephenprn.clock.R
import com.stephenprn.clock.alarm.AlarmStore
import com.stephenprn.clock.widget.StopwatchWidgetProvider
import com.stephenprn.clock.widget.TimersWidgetProvider
import java.util.concurrent.CopyOnWriteArraySet

/** What JavaScript is told whenever a timer or the stopwatch changes (`ToolsState` in the spec). */
internal data class ToolsSnapshot(val timers: String, val stopwatch: String, val now: Long) {
  companion object {
    fun read(context: Context): ToolsSnapshot {
      val store = ToolStore(context)
      val timers = org.json.JSONArray().also { array -> store.runs().forEach { array.put(it.toJson()) } }
      return ToolsSnapshot(timers.toString(), store.stopwatch().toJson().toString(), System.currentTimeMillis())
    }
  }
}

/** Who wants to know (the module, for JavaScript; the timer's window); the widgets are drawn again each time. */
internal object ToolEvents {
  private val listeners = CopyOnWriteArraySet<(ToolsSnapshot) -> Unit>()
  private val main = Handler(Looper.getMainLooper())

  fun add(listener: (ToolsSnapshot) -> Unit) {
    listeners.add(listener)
  }

  fun remove(listener: (ToolsSnapshot) -> Unit) {
    listeners.remove(listener)
  }

  fun changed(context: Context) {
    val app = context.applicationContext
    TimersWidgetProvider.redrawAll(app)
    StopwatchWidgetProvider.redrawAll(app)
    if (listeners.isEmpty()) return
    val snapshot = ToolsSnapshot.read(app)
    main.post { for (listener in listeners) listener(snapshot) }
  }
}

/**
 * Clock's timers on this phone: each run kept in `ToolStore`, its end armed with `setAlarmClock`
 * (exact, never held back by Doze, as the alarms are), its countdown shown in a notification that
 * counts by itself (Pause or Reprendre, +1 min, Supprimer work with the app closed). At its end the
 * receiver hands it to `TimerService`, which rings it. JavaScript only asks (start, pause, +1 min…)
 * and is told what changed; the widgets ask the same through `ToolReceiver`.
 */
internal object TimerEngine {
  const val ACTION_END = "com.stephenprn.clock.tools.TIMER_END"
  const val ACTION_TIMER = "com.stephenprn.clock.tools.TIMER"
  const val ACTION_START = "com.stephenprn.clock.tools.TIMER_START"
  const val EXTRA_ID = "id"
  const val EXTRA_ACTION = "action"
  const val EXTRA_AT = "at"
  const val EXTRA_SECONDS = "seconds"
  const val EXTRA_TIMER = "timer"

  private const val CHANNEL = "clock.timers"
  private const val NOTICE = 7400
  private const val MINUTE = 60_000L
  /** The runs a phone keeps at once: past it the oldest stopped one goes. */
  private const val MOST_RUNS = 20

  // ── what is asked ─────────────────────────────────────────────────────────

  /** A run JavaScript built (`startRun`), started now whatever its moment says (the phone's clock is the truth). */
  @Synchronized
  fun start(context: Context, json: String) {
    val asked = TimerRunRecord.fromJson(runCatching { org.json.JSONObject(json) }.getOrNull()) ?: return
    val now = System.currentTimeMillis()
    val run = asked.copy(state = TimerRunRecord.RUNNING, endsAt = now + asked.total, left = asked.total, startedAt = now, silenced = false)
    save(context, (ToolStore(context).runs().filter { it.id != run.id } + run).takeLast(MOST_RUNS))
  }

  /** A length started from the widget: a saved timer by its id (as JavaScript last handed it to the widgets), else an instant one. */
  @Synchronized
  fun startFrom(context: Context, timerId: String?, seconds: Long) {
    val store = ToolStore(context)
    val now = System.currentTimeMillis()
    val list = com.stephenprn.clock.widget.ToolWidgets.array(context, "timers")
    val saved = timerId?.let { id -> (0 until list.length()).map { list.optJSONObject(it) }.firstOrNull { it?.optString("id") == id } }
    val length = ((saved?.optLong("seconds") ?: seconds).coerceIn(1L, TimerRunRecord.MOST / 1000L)) * 1000L
    val settings = runCatching { org.json.JSONObject(AlarmStore(context).planText() ?: "{}").optJSONObject("settings") }.getOrNull()
    val run =
        TimerRunRecord(
            id = java.util.UUID.randomUUID().toString(),
            timerId = saved?.optString("id"),
            label = saved?.optString("label").orEmpty(),
            length = length,
            total = length,
            state = TimerRunRecord.RUNNING,
            endsAt = now + length,
            left = length,
            sound = saved?.optString("sound")?.ifEmpty { null } ?: settings?.optString("timerSound")?.ifEmpty { null } ?: "bell",
            vibrate = saved?.optBoolean("vibrate", true) ?: settings?.optBoolean("timerVibrate", true) ?: true,
            startedAt = now,
        )
    save(context, (store.runs() + run).takeLast(MOST_RUNS))
  }

  /** `pause`, `resume`, `add` (+1 min), `reset`, `delete`, `stop` (a ring answered: the run goes). */
  @Synchronized
  fun act(context: Context, id: String, action: String) {
    val store = ToolStore(context)
    val now = System.currentTimeMillis()
    val runs = store.runs()
    val run = runs.firstOrNull { it.id == id } ?: return
    val next: TimerRunRecord? =
        when (action) {
          "pause" -> if (run.state == TimerRunRecord.RUNNING) run.copy(state = TimerRunRecord.PAUSED, left = maxOf(0L, run.endsAt - now)) else run
          "resume" -> if (run.state == TimerRunRecord.PAUSED) run.copy(state = TimerRunRecord.RUNNING, endsAt = now + run.left) else run
          "add" ->
              when (run.state) {
                TimerRunRecord.RINGING -> run.copy(state = TimerRunRecord.RUNNING, endsAt = now + MINUTE, left = MINUTE, total = MINUTE, silenced = false)
                TimerRunRecord.PAUSED -> run.copy(left = run.left + MINUTE, total = run.total + MINUTE)
                else -> run.copy(endsAt = run.endsAt + MINUTE, total = run.total + MINUTE)
              }
          "reset" -> run.copy(state = TimerRunRecord.PAUSED, left = run.length, total = run.length, silenced = false)
          "delete", "stop" -> null
          else -> run
        }
    save(context, runs.mapNotNull { if (it.id == id) next else it })
  }

  /** « Tout arrêter »: every timer that rings goes. */
  @Synchronized
  fun stopRinging(context: Context) {
    save(context, ToolStore(context).runs().filter { it.state != TimerRunRecord.RINGING })
  }

  /** A run's end, as AlarmManager delivers it: it rings if it is still meant to. */
  @Synchronized
  fun ended(context: Context, id: String, at: Long) {
    val runs = ToolStore(context).runs()
    val run = runs.firstOrNull { it.id == id }
    if (run == null || run.state != TimerRunRecord.RUNNING || run.endsAt != at) {
      arm(context, runs)
      return
    }
    save(context, runs.map { if (it.id == id) it.copy(state = TimerRunRecord.RINGING) else it })
  }

  /** After a restart or an update: Android forgot the alarms. A timer whose end came meanwhile rings now (or is shown silenced, when long gone); the rest are armed again. */
  @Synchronized
  fun recover(context: Context) {
    val now = System.currentTimeMillis()
    val silenceAfter = AlarmStore(context).plan().settings.silenceAfter * MINUTE
    val runs = ToolStore(context).runs().map { run ->
      if (run.state == TimerRunRecord.RUNNING && run.endsAt <= now) run.copy(state = TimerRunRecord.RINGING, silenced = now - run.endsAt > silenceAfter)
      else if (run.state == TimerRunRecord.RINGING && !TimerService.isRunning) run.copy(silenced = run.silenced || now - run.endsAt > silenceAfter)
      else run
    }
    save(context, runs)
    StopwatchEngine.show(context)
  }

  /** Kept, armed, shown, rung, said. */
  private fun save(context: Context, runs: List<TimerRunRecord>) {
    ToolStore(context).saveRuns(runs)
    arm(context, runs)
    TimerService.refresh(context)
    ToolEvents.changed(context)
  }

  // ── armed and shown ───────────────────────────────────────────────────────

  private fun arm(context: Context, runs: List<TimerRunRecord>) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val prefs = context.createDeviceProtectedStorageContext().getSharedPreferences("clock.tools", Context.MODE_PRIVATE)
    val wanted = runs.filter { it.state == TimerRunRecord.RUNNING }.associate { it.id to it.endsAt }
    val armed = prefs.getStringSet("armed", emptySet()) ?: emptySet()
    for (id in armed - wanted.keys) operation(context, id, 0L, PendingIntent.FLAG_NO_CREATE)?.let { alarms.cancel(it); it.cancel() }
    for ((id, at) in wanted) {
      val operation = operation(context, id, at, PendingIntent.FLAG_UPDATE_CURRENT) ?: continue
      try {
        alarms.setAlarmClock(AlarmManager.AlarmClockInfo(at, openTimers(context, 20)), operation)
      } catch (_: SecurityException) {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
      }
    }
    prefs.edit().putStringSet("armed", wanted.keys).commit()
    notices(context, runs)
  }

  private fun operation(context: Context, id: String, at: Long, flags: Int): PendingIntent? =
      PendingIntent.getBroadcast(
          context,
          0,
          Intent(context, ToolReceiver::class.java).setAction(ACTION_END).setData(Uri.parse("unlease-clock-timer:end:$id")).putExtra(EXTRA_ID, id).putExtra(EXTRA_AT, at),
          flags or PendingIntent.FLAG_IMMUTABLE,
      )

  /** The app, on its timers (`unlease-clock://timers`). */
  fun openTimers(context: Context, code: Int): PendingIntent =
      PendingIntent.getActivity(
          context,
          code,
          Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://timers"), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  /** A run's button in a notification or a widget. */
  fun action(context: Context, id: String, action: String): PendingIntent =
      PendingIntent.getBroadcast(
          context,
          0,
          Intent(context, ToolReceiver::class.java).setAction(ACTION_TIMER).setData(Uri.parse("unlease-clock-timer:$action:$id")).putExtra(EXTRA_ID, id).putExtra(EXTRA_ACTION, action),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  fun channels(context: Context, words: ToolWords) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
        NotificationChannel(CHANNEL, words.channelTimers, NotificationManager.IMPORTANCE_LOW).apply {
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
    )
  }

  /** « Minuteur de 5 min », or its label. */
  fun name(run: TimerRunRecord, words: ToolWords): String = run.label.trim().ifEmpty { words.timerOf.replace("{length}", lengthWords(run.length)) }

  /** « 5 min », « 1 h 30 », « 45 s », as `lengthWords` writes them (units the same in French and English). */
  fun lengthWords(ms: Long): String {
    val whole = ms / 1000L
    val hours = whole / 3600
    val minutes = (whole % 3600) / 60
    val seconds = whole % 60
    return when {
      hours == 0L && minutes == 0L -> "$seconds s"
      hours == 0L -> if (seconds == 0L) "$minutes min" else "$minutes min ${"%02d".format(seconds)} s"
      seconds == 0L -> if (minutes == 0L) "$hours h" else "$hours h ${"%02d".format(minutes)}"
      else -> "$hours h ${"%02d".format(minutes)} min ${"%02d".format(seconds)} s"
    }
  }

  /** `4:59`, `1:04:59`: a countdown in whole seconds up. */
  fun countdown(ms: Long): String {
    val total = (ms + 999) / 1000
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
  }

  /** One notification per timer running or paused, its countdown counting by itself; a ringing one is `TimerService`'s. */
  private fun notices(context: Context, runs: List<TimerRunRecord>) {
    val manager = NotificationManagerCompat.from(context)
    val words = ToolStore(context).words(context)
    channels(context, words)
    val shown = runs.filter { it.state != TimerRunRecord.RINGING }
    val now = System.currentTimeMillis()
    for (run in runs) if (run.state == TimerRunRecord.RINGING) manager.cancel(run.id, NOTICE)
    for (run in shown) {
      val running = run.state == TimerRunRecord.RUNNING
      val builder =
          NotificationCompat.Builder(context, CHANNEL)
              .setSmallIcon(R.drawable.ic_stat_timer)
              .setContentTitle(name(run, words))
              .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
              .setPriority(NotificationCompat.PRIORITY_LOW)
              .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
              .setOngoing(true)
              .setSilent(true)
              .setOnlyAlertOnce(true)
              .setGroup(CHANNEL)
              .setSortKey(run.startedAt.toString())
              .setContentIntent(openTimers(context, 21))
              .addAction(0, if (running) words.pause else words.resume, action(context, run.id, if (running) "pause" else "resume"))
              .addAction(0, words.addMinute, action(context, run.id, "add"))
              .addAction(0, words.delete, action(context, run.id, "delete"))
      if (running) {
        builder.setUsesChronometer(true).setChronometerCountDown(true).setWhen(run.endsAt).setShowWhen(true)
      } else {
        builder.setShowWhen(false).setContentText(words.paused.replace("{time}", countdown(run.remaining(now))))
      }
      try {
        manager.notify(run.id, NOTICE, builder.build())
      } catch (_: SecurityException) {
        // Notifications refused: the timer still rings.
      }
    }
    // Those gone (deleted, stopped): their notification goes with them.
    val prefs = context.createDeviceProtectedStorageContext().getSharedPreferences("clock.tools", Context.MODE_PRIVATE)
    val before = prefs.getStringSet("noticed", emptySet()) ?: emptySet()
    val now2 = shown.map { it.id }.toSet()
    for (id in before - now2) manager.cancel(id, NOTICE)
    prefs.edit().putStringSet("noticed", now2).apply()
  }
}
