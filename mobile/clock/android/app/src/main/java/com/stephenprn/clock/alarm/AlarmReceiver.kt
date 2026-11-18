package com.stephenprn.clock.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

/**
 * Where AlarmManager's rings arrive (`AlarmScheduler`), and « Arrêter » on a snoozed alarm's
 * notification. Direct Boot aware: it rings before the phone is first unlocked after a restart too.
 * Not exported: only the app's own PendingIntents reach it.
 *
 * A ring is checked before it rings (its alarm still wanted, not rung already, not hours late: a
 * phone off at that moment), marked as rung at once, handed to `RingService` under a wake lock that
 * bridges the gap until the service holds its own, and the alarm's next ring is armed.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_RING -> ring(context, intent.getStringExtra(AlarmScheduler.EXTRA_KEY) ?: return, intent.getLongExtra(AlarmScheduler.EXTRA_AT, 0L))
      AlarmScheduler.ACTION_DISMISS -> dismiss(context, intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return)
      AlarmScheduler.ACTION_WATCH -> AlarmScheduler.checkRing(context)
    }
  }

  private fun ring(context: Context, key: String, at: Long) {
    val store = AlarmStore(context)
    val plan = store.plan()
    val now = System.currentTimeMillis()
    val kind = key.substringBefore(':')
    val id = key.substringAfter(':')
    val record: RingRecord =
        when (kind) {
          "ring" -> {
            val alarm = if (id == AlarmStore.TEST_ID) store.test()?.first else plan.alarm(id)
            // Gone, or this phone no longer rings, since it was armed; or this ring rang already.
            if (alarm == null || (id != AlarmStore.TEST_ID && !plan.settings.ringsHere) || store.fired(id) >= at) {
              AlarmScheduler.arm(context)
              return
            }
            store.setFired(id, at)
            if (id == AlarmStore.TEST_ID) store.clearTest()
            RingRecord(alarm, at, now, 0)
          }
          "snooze" -> {
            val snooze = store.snooze(id)
            if (snooze == null || snooze.until != at) {
              AlarmScheduler.arm(context)
              return
            }
            store.clearSnooze(id)
            snooze.record
          }
          else -> return
        }
    // Armed inexact (Android 12 without « Alarmes et rappels »), a ring may come up to an hour late: still rung.
    val late = if (store.inexact()) maxOf(plan.settings.silenceAfter * Civil.MINUTE, Civil.HOUR) else plan.settings.silenceAfter * Civil.MINUTE
    if (now - at > late) {
      // Delivered long after its moment (the phone was off, the clock moved): said, never rung hours late.
      RingNotifications.missed(context, record.alarm, record.at, plan.settings.words)
    } else {
      holdUntilServiceStarts(context)
      RingService.start(context, record.alarm, record.at, record.snoozes)
    }
    AlarmScheduler.arm(context)
    RingEvents.changed(context)
  }

  private fun dismiss(context: Context, id: String) {
    val store = AlarmStore(context)
    store.clearSnooze(id)
    RingNotifications.cancelSnoozed(context, id)
    AlarmScheduler.arm(context)
    RingEvents.changed(context)
  }

  companion object {
    @Volatile private var bridge: PowerManager.WakeLock? = null

    /** AlarmManager holds the phone awake only while `onReceive` runs: this holds it until the service has its own. */
    private fun holdUntilServiceStarts(context: Context) {
      val power = context.getSystemService(PowerManager::class.java) ?: return
      bridge?.takeIf { it.isHeld }?.release()
      bridge = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "clock:ring-start").apply {
        setReferenceCounted(false)
        acquire(30_000L)
      }
    }

    /** The service holds its own now. */
    internal fun releaseBridge() {
      bridge?.takeIf { it.isHeld }?.release()
      bridge = null
    }
  }
}

/**
 * The system's changes that make Android forget alarms or move their moments: a restart (before the
 * first unlock too: Direct Boot), an update of the app, the clock or the zone set, exact alarms
 * allowed again. Each a protected broadcast only Android sends, so not exported. After a restart or an
 * update a ring that came meanwhile rings now or is said missed (`AlarmScheduler.recover`); otherwise
 * everything is armed again for the new clock.
 */
class AlarmSystemReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON" -> {
        AlarmScheduler.recover(context)
        // The timers and the stopwatch too: a timer whose end came meanwhile rings now, the rest are armed again.
        com.stephenprn.clock.tools.TimerEngine.recover(context)
      }
      else -> AlarmScheduler.arm(context)
    }
    RingEvents.changed(context)
  }
}
