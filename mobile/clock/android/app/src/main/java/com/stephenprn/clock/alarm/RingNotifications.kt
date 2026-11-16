package com.stephenprn.clock.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.UserManager
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.stephenprn.clock.MainActivity
import com.stephenprn.clock.R
import java.util.Date

/**
 * The engine's notifications, in the words JavaScript handed it (`EngineWords`): the ringing one
 * (the foreground service's: category alarm, so « Ne pas déranger » lets it through; its full-screen
 * intent wakes the screen with the ringing window over the lock screen, or shows as a heads-up while
 * the phone is in use; « Répéter » and « Arrêter » work from it with the app closed or the phone
 * locked), a snoozed alarm (its countdown and « Arrêter »), and a missed one.
 */
internal object RingNotifications {
  /** Silent: the service plays the sound and vibrates itself, on the alarm stream. */
  const val CHANNEL_RINGING = "clock.ringing"
  /** Missed alarms, snoozed alarms. */
  private const val CHANNEL_NOTICES = "clock.notices"
  /** Only if the service could not start: the notification rings itself, on the alarm stream, until answered. */
  private const val CHANNEL_FALLBACK = "clock.fallback"

  const val ID_RINGING = 7001
  /** Each alarm's snoozed, missed and fallback notification: one id per kind, tagged with the alarm's id, so two alarms never share one. */
  private const val SNOOZED = 7100
  private const val MISSED = 7200
  private const val FALLBACK = 7300
  /** A request code for a pending intent of its own (its data keeps it apart anyway). */
  private fun codeOf(base: Int, alarmId: String) = base + Math.floorMod(alarmId.hashCode(), 1000)

  /** Whether the ringing channel still pops up (high importance): lowered or blocked, no window opens and no buttons show. */
  fun ringingChannelOn(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val channel = context.getSystemService(NotificationManager::class.java)?.getNotificationChannel(CHANNEL_RINGING) ?: return true
    return channel.importance >= NotificationManager.IMPORTANCE_HIGH
  }

  fun channels(context: Context, words: EngineWords) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
        NotificationChannel(CHANNEL_RINGING, words.channelRinging, NotificationManager.IMPORTANCE_HIGH).apply {
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setShowBadge(false)
        },
    )
    manager.createNotificationChannel(
        NotificationChannel(CHANNEL_NOTICES, words.channelNotices, NotificationManager.IMPORTANCE_DEFAULT).apply {
          setSound(null, null)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
    )
    manager.createNotificationChannel(
        NotificationChannel(CHANNEL_FALLBACK, words.channelRinging, NotificationManager.IMPORTANCE_HIGH).apply {
          setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), Sounds.ATTRIBUTES)
          enableVibration(true)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setBypassDnd(true)
        },
    )
  }

  private fun clock(context: Context, at: Long): String = DateFormat.getTimeFormat(context).format(Date(at))

  /** What opens the ringing window. */
  fun windowIntent(context: Context): Intent =
      Intent(context, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)

  /** The ringing window before the first unlock (`LockedRingActivity`). */
  private fun lockedWindow(context: Context): PendingIntent =
      PendingIntent.getActivity(
          context,
          4,
          Intent(context, LockedRingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

  /** The ringing window, over the lock screen. */
  fun ringWindow(context: Context): PendingIntent =
      PendingIntent.getActivity(context, 2, windowIntent(context), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun serviceAction(context: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getService(context, code, Intent(context, RingService::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun openApp(context: Context): PendingIntent =
      PendingIntent.getActivity(context, 3, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun ringing(context: Context, record: RingRecord, words: EngineWords): Notification {
    channels(context, words)
    // Before the first unlock after a restart, React Native cannot run: the window drawn natively.
    val unlocked = context.getSystemService(UserManager::class.java)?.isUserUnlocked != false
    val window = if (unlocked) ringWindow(context) else lockedWindow(context)
    return NotificationCompat.Builder(context, CHANNEL_RINGING)
        .setSmallIcon(R.drawable.ic_stat_clock)
        .setContentTitle(record.alarm.title)
        .setContentText(clock(context, record.at))
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setShowWhen(false)
        // Never `setSilent`: a muted notification may not fire its full-screen intent. The channel itself
        // has no sound and no vibration; the service plays and vibrates.
        .setFullScreenIntent(window, true)
        .setContentIntent(window)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .addAction(0, words.snooze, serviceAction(context, RingService.ACTION_SNOOZE, 10))
        .addAction(0, words.stop, serviceAction(context, RingService.ACTION_STOP, 11))
        .build()
  }

  fun snoozed(context: Context, record: RingRecord, until: Long, words: EngineWords) {
    channels(context, words)
    val dismiss =
        PendingIntent.getBroadcast(
            context,
            codeOf(SNOOZED, record.alarm.id),
            Intent(context, AlarmReceiver::class.java).setAction(AlarmScheduler.ACTION_DISMISS).setData(Uri.parse("unlease-clock-alarm:dismiss:${record.alarm.id}")).putExtra(AlarmScheduler.EXTRA_ID, record.alarm.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    val notification =
        NotificationCompat.Builder(context, CHANNEL_NOTICES)
            .setSmallIcon(R.drawable.ic_stat_clock)
            .setContentTitle(record.alarm.title)
            .setContentText(words.snoozedUntil.replace("{time}", clock(context, until)))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setOngoing(true)
            .setWhen(until)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setTimeoutAfter(until - System.currentTimeMillis())
            .setContentIntent(openApp(context))
            .addAction(0, words.stop, dismiss)
            .build()
    notify(context, record.alarm.id, SNOOZED, notification)
  }

  fun cancelSnoozed(context: Context, alarmId: String) {
    NotificationManagerCompat.from(context).cancel(alarmId, SNOOZED)
  }

  fun cancelFallback(context: Context, alarmId: String) {
    NotificationManagerCompat.from(context).cancel(alarmId, FALLBACK)
  }

  fun missed(context: Context, alarm: PlannedAlarm, at: Long, words: EngineWords) {
    channels(context, words)
    cancelSnoozed(context, alarm.id)
    val notification =
        NotificationCompat.Builder(context, CHANNEL_NOTICES)
            .setSmallIcon(R.drawable.ic_stat_clock)
            .setContentTitle(words.missed)
            .setContentText("${clock(context, at)} · ${alarm.title}")
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setWhen(at)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build()
    notify(context, alarm.id, MISSED, notification)
  }

  /** When the ringing service cannot start: a notification that rings on its own until it is touched, or for the ringing time. */
  fun fallback(context: Context, record: RingRecord, settings: RingSettings) {
    val words = settings.words
    channels(context, words)
    val notification =
        NotificationCompat.Builder(context, CHANNEL_FALLBACK)
            .setSmallIcon(R.drawable.ic_stat_clock)
            .setContentTitle(record.alarm.title)
            .setContentText(clock(context, record.at))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM)
            .setVibrate(longArrayOf(0, 700, 500))
            .setFullScreenIntent(openApp(context), true)
            .setContentIntent(openApp(context))
            .setAutoCancel(true)
            .setTimeoutAfter(settings.silenceAfter * Civil.MINUTE)
            .build()
            .apply { flags = flags or Notification.FLAG_INSISTENT }
    notify(context, record.alarm.id, FALLBACK, notification)
  }

  private fun notify(context: Context, tag: String, id: Int, notification: Notification) {
    try {
      NotificationManagerCompat.from(context).notify(tag, id, notification)
    } catch (_: SecurityException) {
      // Notifications refused (Android 13): Réglages says so; the ringing service rings regardless.
    }
  }
}
