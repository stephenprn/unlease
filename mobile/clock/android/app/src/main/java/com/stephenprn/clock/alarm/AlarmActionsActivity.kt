package com.stephenprn.clock.alarm

import android.app.Activity
import android.os.Bundle
import android.provider.AlarmClock

/**
 * The assistant's (or another app's) « stop the alarm » and « snooze it » (`AlarmClock.ACTION_DISMISS_ALARM`,
 * `ACTION_SNOOZE_ALARM`): what rings now is stopped or snoozed at once; a dismissal with nothing ringing
 * stops a snoozed alarm. Nothing shows.
 */
class AlarmActionsActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val store = AlarmStore(this)
    when (intent?.action) {
      AlarmClock.ACTION_SNOOZE_ALARM -> if (store.ring() != null) RingService.send(this, RingService.ACTION_SNOOZE)
      AlarmClock.ACTION_DISMISS_ALARM ->
          if (store.ring() != null) RingService.send(this, RingService.ACTION_STOP)
          else {
            for (snooze in store.snoozes()) {
              store.clearSnooze(snooze.record.alarm.id)
              RingNotifications.cancelSnoozed(this, snooze.record.alarm.id)
            }
            AlarmScheduler.arm(this)
            RingEvents.changed(this)
          }
    }
    finish()
  }
}
