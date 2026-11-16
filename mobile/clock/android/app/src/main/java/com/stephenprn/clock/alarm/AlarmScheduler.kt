package com.stephenprn.clock.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.stephenprn.clock.MainActivity
import java.util.TimeZone
import kotlin.math.max

/** What arming did: how many rings, the next one (0 none), and whether Android refused exact alarms. */
internal data class ArmOutcome(val armed: Int, val next: Long, val inexact: Boolean)

/**
 * Arms every ring to come with `setAlarmClock`: Android's alarm for alarm clocks, exact to the
 * minute, never held back by Doze, App Standby or the battery's « Restreinte », shown as the alarm
 * icon in the status bar (and its time on the lock screen), whose tap opens the app. Each alarm's next
 * ring and each snooze is one AlarmManager alarm of its own (`ring:<id>`, `snooze:<id>`), so one
 * ringing never takes another away; everything is armed again, idempotently, whenever the plan, the
 * clock, the zone or the phone changes, and what is no longer wanted is taken back.
 */
internal object AlarmScheduler {
  const val ACTION_RING = "com.stephenprn.clock.alarm.RING"
  const val ACTION_DISMISS = "com.stephenprn.clock.alarm.DISMISS"
  const val ACTION_WATCH = "com.stephenprn.clock.alarm.WATCH"
  /** How often the watch looks at a ring. */
  private const val WATCH_EVERY = 60_000L
  const val EXTRA_KEY = "key"
  const val EXTRA_AT = "at"
  const val EXTRA_ID = "id"

  /** Arms what the plan, the snoozes and the test ask for now. Safe to call any time, as often as wanted. */
  @Synchronized
  fun arm(context: Context): ArmOutcome {
    val store = AlarmStore(context)
    val plan = store.plan()
    val now = System.currentTimeMillis()
    val zone = TimeZone.getDefault()
    val wanted = LinkedHashMap<String, Long>()
    if (plan.settings.ringsHere) {
      for (alarm in plan.alarms) {
        // After the ring that rang last: one armed again within its own minute never rings twice.
        NextRing.after(alarm, max(now, store.fired(alarm.id)), zone)?.let { wanted["ring:${alarm.id}"] = it.at }
      }
    }
    // A snooze is the person's answer to a ring: it stays while its alarm does (switched off or deleted, it goes).
    for (snooze in store.snoozes()) {
      val id = snooze.record.alarm.id
      if (id == AlarmStore.TEST_ID || plan.alarm(id) != null) {
        wanted["snooze:$id"] = snooze.until
      } else {
        store.clearSnooze(id)
        RingNotifications.cancelSnoozed(context, id)
      }
    }
    store.test()?.let { (_, at) -> if (at > now - Civil.MINUTE) wanted["ring:${AlarmStore.TEST_ID}"] = at else store.clearTest() }

    val alarms = context.getSystemService(AlarmManager::class.java)
    for (key in store.armed() - wanted.keys) cancel(context, alarms, key)
    var inexact = false
    for ((key, at) in wanted) inexact = set(context, alarms, key, at) || inexact
    store.setArmed(wanted.keys, inexact)
    return ArmOutcome(wanted.size, wanted.values.minOrNull() ?: 0L, inexact)
  }

  /** Arms one ring; true when Android refused an exact alarm and it was armed inexact instead. */
  private fun set(context: Context, alarms: AlarmManager, key: String, at: Long): Boolean {
    val operation = operation(context, key, at, PendingIntent.FLAG_UPDATE_CURRENT)!!
    return try {
      alarms.setAlarmClock(AlarmManager.AlarmClockInfo(at, showIntent(context)), operation)
      false
    } catch (_: SecurityException) {
      // Android 12 without « Alarmes et rappels » (the app holds USE_EXACT_ALARM from Android 13):
      // the closest Android allows, said in Réglages (`health`).
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
      true
    }
  }

  private fun cancel(context: Context, alarms: AlarmManager, key: String) {
    val operation = operation(context, key, 0L, PendingIntent.FLAG_NO_CREATE) ?: return
    alarms.cancel(operation)
    operation.cancel()
  }

  /** The broadcast a ring sends: one per key (its data), its moment in the extras. */
  private fun operation(context: Context, key: String, at: Long, flags: Int): PendingIntent? =
      PendingIntent.getBroadcast(
          context,
          0,
          Intent(context, AlarmReceiver::class.java).setAction(ACTION_RING).setData(Uri.parse("unlease-clock-alarm:$key")).putExtra(EXTRA_KEY, key).putExtra(EXTRA_AT, at),
          flags or PendingIntent.FLAG_IMMUTABLE,
      )

  /** What the status bar's alarm opens: the app, on its alarms. */
  private fun showIntent(context: Context): PendingIntent =
      PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java).setAction(android.provider.AlarmClock.ACTION_SHOW_ALARMS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  /**
   * While an alarm rings, a look every minute (an exact alarm of its own, which may start the
   * ringing service from the background): should the process die mid-ring (a crash, the system),
   * the ring starts again, or is said missed once its ringing time is over (`checkRing`).
   */
  fun watch(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val operation = watchOperation(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    try {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + WATCH_EVERY, operation)
    } catch (_: SecurityException) {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + WATCH_EVERY, operation)
    }
  }

  fun unwatch(context: Context) {
    val operation = watchOperation(context, PendingIntent.FLAG_NO_CREATE) ?: return
    context.getSystemService(AlarmManager::class.java)?.cancel(operation)
    operation.cancel()
  }

  private fun watchOperation(context: Context, flags: Int): PendingIntent? =
      PendingIntent.getBroadcast(context, 3, Intent(context, AlarmReceiver::class.java).setAction(ACTION_WATCH), flags or PendingIntent.FLAG_IMMUTABLE)

  /**
   * A ring the store holds: still ringing here, looked at again in a minute; cut short (the process
   * died), rung again within its ringing time, else said missed. Also when the app opens.
   */
  @Synchronized
  fun checkRing(context: Context) {
    val store = AlarmStore(context)
    val record = store.ring() ?: return
    if (RingService.isRunning) {
      watch(context)
      return
    }
    val settings = store.plan().settings
    if (System.currentTimeMillis() - record.since < settings.silenceAfter * Civil.MINUTE) {
      RingService.start(context, record.alarm, record.at, record.snoozes, record.since)
    } else {
      store.clearRing()
      RingNotifications.cancelFallback(context, record.alarm.id)
      RingNotifications.missed(context, record.alarm, record.at, settings.words)
      RingEvents.changed(context)
    }
  }

  /**
   * After a restart (or an update): the phone was off, and Android forgot every alarm. A ring that
   * came while it was off rings now if it is still within its ringing time (`silenceAfter`), else it
   * is said missed (within twelve hours); then everything is armed again. A ring cut short by the
   * restart is said missed. Snoozes that came due meanwhile the same.
   */
  @Synchronized
  fun recover(context: Context) {
    val store = AlarmStore(context)
    val plan = store.plan()
    val now = System.currentTimeMillis()
    val zone = TimeZone.getDefault()
    val ringing = RingService.isRunning
    if (!ringing) store.ring()?.let { record ->
      store.clearRing()
      RingNotifications.missed(context, record.alarm, record.at, plan.settings.words)
    }
    val window = plan.settings.silenceAfter * Civil.MINUTE
    // The latest ring still within its time rings now; any other one gone by is said missed.
    var toRing: RingRecord? = null
    var toRingAt = 0L
    fun consider(record: RingRecord, dueAt: Long) {
      if (now - dueAt <= window && !ringing && dueAt > toRingAt) {
        toRing?.let { RingNotifications.missed(context, it.alarm, it.at, plan.settings.words) }
        toRing = record
        toRingAt = dueAt
      } else if (now - dueAt <= 12 * Civil.HOUR) {
        RingNotifications.missed(context, record.alarm, record.at, plan.settings.words)
      }
    }
    if (plan.settings.ringsHere) {
      for (alarm in plan.alarms) {
        val last = NextRing.lastBefore(alarm, now, zone) ?: continue
        if (last.at <= store.fired(alarm.id)) continue
        store.setFired(alarm.id, last.at)
        consider(RingRecord(alarm, last.at, now, 0), last.at)
      }
    }
    for (snooze in store.snoozes()) {
      if (snooze.until > now) continue
      store.clearSnooze(snooze.record.alarm.id)
      consider(snooze.record, snooze.until)
    }
    toRing?.let { RingService.start(context, it.alarm, it.at, it.snoozes) }
    arm(context)
  }
}
