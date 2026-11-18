package com.stephenprn.clock.tools

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.stephenprn.clock.BuildConfig
import com.stephenprn.clock.MainActivity
import com.stephenprn.clock.R

/**
 * The stopwatch on this phone (`ToolStore`): started, paused, a lap, reset, from the app, its
 * notification or its widget. While it is not reset, a notification shows it counting by itself
 * (Android's own chronometer: nothing wakes the phone to draw it), with « Pause » and « Tour »
 * running, « Reprendre » and « Réinitialiser » paused.
 */
internal object StopwatchEngine {
  const val ACTION = "com.stephenprn.clock.tools.STOPWATCH"
  const val EXTRA_ACTION = "action"
  private const val CHANNEL = "clock.stopwatch"
  private const val NOTICE = 7700

  /** `start`, `pause`, `lap`, `reset`, `toggle` (start or pause). */
  @Synchronized
  fun act(context: Context, action: String) {
    val store = ToolStore(context)
    val watch = store.stopwatch()
    val now = System.currentTimeMillis()
    val next =
        when (action) {
          "start" -> if (watch.running) watch else watch.copy(startedAt = now)
          "pause" -> if (watch.running) StopwatchState(null, watch.elapsed(now), watch.laps) else watch
          "toggle" -> if (watch.running) StopwatchState(null, watch.elapsed(now), watch.laps) else watch.copy(startedAt = now)
          "lap" -> if (watch.running) watch.copy(laps = (watch.laps + watch.elapsed(now)).takeLast(StopwatchState.MOST_LAPS)) else watch
          "reset" -> StopwatchState.RESET
          else -> watch
        }
    if (next == watch) return
    store.saveStopwatch(next)
    show(context)
    ToolEvents.changed(context)
  }

  /** What the stopwatch's buttons send. */
  fun action(context: Context, action: String): PendingIntent =
      PendingIntent.getBroadcast(
          context,
          0,
          Intent(context, ToolReceiver::class.java).setAction(ACTION).setData(Uri.parse("unlease-clock-stopwatch:$action")).putExtra(EXTRA_ACTION, action),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  /** The app, on its stopwatch (`unlease-clock://stopwatch`). */
  fun open(context: Context, code: Int): PendingIntent =
      PendingIntent.getActivity(
          context,
          code,
          Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://stopwatch"), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  /** `01:23`, `1:01:23`: the stopwatch at a glance (no hundredths where nothing redraws them). */
  fun clock(ms: Long): String {
    val seconds = ms / 1000
    val hours = seconds / 3600
    return if (hours > 0) "%d:%02d:%02d".format(hours, (seconds % 3600) / 60, seconds % 60) else "%02d:%02d".format((seconds % 3600) / 60, seconds % 60)
  }

  /** Its notification, or none once reset. */
  fun show(context: Context) {
    val manager = NotificationManagerCompat.from(context)
    val watch = ToolStore(context).stopwatch()
    if (watch.reset) {
      manager.cancel(NOTICE)
      return
    }
    val words = ToolStore(context).words(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
          NotificationChannel(CHANNEL, words.channelStopwatch, NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          },
      )
    }
    val now = System.currentTimeMillis()
    val lapNow = words.lapNumber.replace("{number}", (watch.laps.size + 1).toString())
    val builder =
        NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_stopwatch)
            .setContentTitle(words.stopwatch)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open(context, 30))
    if (watch.running) {
      builder
          .setUsesChronometer(true)
          .setWhen(now - watch.elapsed(now))
          .setShowWhen(true)
          .setSubText(if (watch.laps.isEmpty()) null else lapNow)
          .addAction(0, words.pause, action(context, "pause"))
          .addAction(0, words.lap, action(context, "lap"))
    } else {
      builder
          .setShowWhen(false)
          .setContentText(words.paused.replace("{time}", clock(watch.elapsed(now))))
          .setSubText(if (watch.laps.isEmpty()) null else lapNow)
          .addAction(0, words.resume, action(context, "start"))
          .addAction(0, words.reset, action(context, "reset"))
    }
    try {
      manager.notify(NOTICE, builder.build())
    } catch (_: SecurityException) {}
  }
}
