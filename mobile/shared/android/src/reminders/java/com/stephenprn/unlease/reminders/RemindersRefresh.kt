package com.stephenprn.unlease.reminders

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * The reminders kept armed with the app closed: the app's `remindersTask` (JavaScript, registered in
 * index.js) run every so often by WorkManager, and soon after the system changes what they depend on
 * (`RefreshReceiver`). It pulls what other devices wrote, arms what came, rings what went by unarmed
 * and still matters, and arms the weeks the app's horizon now reaches. WorkManager keeps the period
 * across restarts and updates; a force stop suspends it until the app is opened again.
 */
object RemindersRefresh {
  /** Registered in each app's index.js under this name. */
  const val TASK = "remindersTask"
  /** A pull on a slow network, then the arming: well under WorkManager's ten minutes. */
  const val TIMEOUT_MS = 50_000L
  private const val PERIODIC = "unlease.reminders.periodic"
  private const val SOON = "unlease.reminders.soon"
  private const val PREFS = "unlease.reminders"
  private const val MINUTES = "minutes"
  /** WorkManager's shortest period. */
  private const val SHORTEST = 15L

  fun keepFresh(context: Context, minutes: Int) {
    val app = context.applicationContext
    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(MINUTES, minutes).apply()
    schedule(app, minutes)
  }

  private fun schedule(context: Context, minutes: Int) {
    val work = WorkManager.getInstance(context)
    if (minutes <= 0) {
      work.cancelUniqueWork(PERIODIC)
      return
    }
    val request = PeriodicWorkRequest.Builder(RefreshWorker::class.java, maxOf(SHORTEST, minutes.toLong()), TimeUnit.MINUTES).build()
    // UPDATE keeps the period's running clock: asked at every start, it never pushes the next run back.
    work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
  }

  /** A restart, an update, the time, the zone, the language or exact alarms changed: a run soon, if the app wants them. */
  fun onSystemChange(context: Context) {
    val app = context.applicationContext
    val minutes = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(MINUTES, 0)
    if (minutes <= 0) return
    schedule(app, minutes)
    // After a run under way, not instead of it: it may have read the clock before the change.
    WorkManager.getInstance(app).enqueueUniqueWork(SOON, ExistingWorkPolicy.APPEND_OR_REPLACE, OneTimeWorkRequest.from(RefreshWorker::class.java))
  }
}
