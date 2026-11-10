package com.stephenprn.unlease.reminders

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The system's changes the reminders depend on, each a protected broadcast only Android sends (so the
 * receiver is not exported): a restart (Notifee arms its own again; this arms what it could not know),
 * an update of the app, the clock set, the zone changed (an all-day event's reminder is counted from
 * midnight here), the language (their words), exact alarms allowed again (those armed inexact meanwhile).
 */
class RefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_LOCALE_CHANGED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> RemindersRefresh.onSystemChange(context)
    }
  }
}
