package com.stephenprn.clock.tools

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Where the timers' and the stopwatch's buttons land (their notifications, their widgets) and where
 * AlarmManager delivers a timer's end. Direct Boot aware: a timer ends and rings before the first
 * unlock after a restart too. Not exported: only the app's own PendingIntents reach it.
 */
class ToolReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      TimerEngine.ACTION_END -> TimerEngine.ended(context, intent.getStringExtra(TimerEngine.EXTRA_ID) ?: return, intent.getLongExtra(TimerEngine.EXTRA_AT, 0L))
      TimerEngine.ACTION_TIMER -> TimerEngine.act(context, intent.getStringExtra(TimerEngine.EXTRA_ID) ?: return, intent.getStringExtra(TimerEngine.EXTRA_ACTION) ?: return)
      TimerEngine.ACTION_START -> TimerEngine.startFrom(context, intent.getStringExtra(TimerEngine.EXTRA_TIMER), intent.getLongExtra(TimerEngine.EXTRA_SECONDS, 300L))
      ACTION_STOP_RINGING -> TimerEngine.stopRinging(context)
      StopwatchEngine.ACTION -> StopwatchEngine.act(context, intent.getStringExtra(StopwatchEngine.EXTRA_ACTION) ?: return)
    }
  }

  companion object {
    const val ACTION_STOP_RINGING = "com.stephenprn.clock.tools.STOP_RINGING"
  }
}
