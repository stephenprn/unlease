package com.stephenprn.clock.tools

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.UserManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import com.stephenprn.clock.R
import com.stephenprn.clock.alarm.AlarmStore
import com.stephenprn.clock.alarm.Klaxon

/**
 * Timers ringing: a foreground service (`systemExempted`, as the alarms', `mediaPlayback` before),
 * started as a timer ends. It rings as an alarm does (the timer's sound on the alarm stream, looping,
 * no ramp: a kitchen timer is heard at once; its vibration), shows the ringing notification (« Temps
 * écoulé », how long ago it ended counting by itself, « +1 min » and « Arrêter »; its full-screen
 * intent opens the timer's window over the lock screen), and holds the phone awake. Several timers
 * ringing at once ring as one. Once the ringing time (the alarms' `silenceAfter`) has passed, it falls
 * silent and leaves a quiet notification: the timer stays « terminé » until it is stopped.
 */
class TimerService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var klaxon: Klaxon? = null
  private var ringingSound: String? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val check = Runnable { refreshNow() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Foreground first, whatever happens next: Android stops a service that does not say so within seconds.
    val ringing = ringingNow()
    if (ringing.isEmpty()) {
      finish()
      return START_NOT_STICKY
    }
    if (!goForeground(notification(this, ringing))) {
      finish()
      return START_NOT_STICKY
    }
    ring(ringing)
    return START_NOT_STICKY
  }

  private fun ringingNow(): List<TimerRunRecord> = ToolStore(this).runs().filter { it.state == TimerRunRecord.RINGING && !it.silenced }

  /** What rings changed: rung, shown, or done. */
  private fun refreshNow() {
    val ringing = ringingNow()
    if (ringing.isEmpty()) return finish()
    NotificationManagerCompat.from(this).let { manager ->
      try {
        manager.notify(ID_RINGING, notification(this, ringing))
      } catch (_: SecurityException) {}
    }
    ring(ringing)
  }

  private fun ring(ringing: List<TimerRunRecord>) {
    val newest = ringing.maxBy { it.endsAt }
    if (klaxon == null || ringingSound != newest.sound) {
      klaxon?.stop()
      klaxon = Klaxon(this).also { it.start(newest.sound, newest.vibrate, 0) }
      ringingSound = newest.sound
      // The app in front shows the ring on its timers' page; elsewhere the notification's full-screen intent opens the window.
      hold()
    }
    // Each ring falls silent once its ringing time is over.
    val silenceAfter = AlarmStore(this).plan().settings.silenceAfter * 60_000L
    val now = System.currentTimeMillis()
    val over = ringing.filter { now - it.endsAt >= silenceAfter }
    if (over.isNotEmpty()) {
      val ids = over.map { it.id }.toSet()
      ToolStore(this).saveRuns(ToolStore(this).runs().map { if (it.id in ids) it.copy(silenced = true) else it })
      for (run in over) quiet(this, run)
      ToolEvents.changed(this)
      handler.post(check)
      return
    }
    handler.removeCallbacks(check)
    handler.postDelayed(check, (ringing.minOf { it.endsAt } + silenceAfter - now).coerceAtLeast(1_000L))
  }

  private fun goForeground(notification: Notification): Boolean {
    val type =
        when {
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
          else -> 0
        }
    try {
      ServiceCompat.startForeground(this, ID_RINGING, notification, type)
      return true
    } catch (error: Exception) {
      Log.w("ClockTimer", "foreground as $type refused", error)
    }
    return try {
      ServiceCompat.startForeground(this, ID_RINGING, notification, if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0)
      true
    } catch (error: Exception) {
      Log.e("ClockTimer", "foreground refused", error)
      false
    }
  }

  private fun hold() {
    val power = getSystemService(PowerManager::class.java) ?: return
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "clock:timer").apply {
      setReferenceCounted(false)
      acquire(61 * 60_000L)
    }
  }

  private fun finish() {
    handler.removeCallbacksAndMessages(null)
    klaxon?.stop()
    klaxon = null
    ringingSound = null
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    klaxon?.stop()
    klaxon = null
    wakeLock?.takeIf { it.isHeld }?.release()
    isRunning = false
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_RINGING = "clock.timers.ringing"
    private const val ID_RINGING = 7500
    private const val QUIET = 7600

    @Volatile var isRunning = false
      private set

    /** Rings what should ring now, or lets it go: after every change of the timers. */
    internal fun refresh(context: Context) {
      val store = ToolStore(context)
      val runs = store.runs()
      // A ring answered or gone: its quiet notification goes with it.
      val manager = NotificationManagerCompat.from(context)
      val silenced = runs.filter { it.state == TimerRunRecord.RINGING && it.silenced }.map { it.id }.toSet()
      val prefs = context.createDeviceProtectedStorageContext().getSharedPreferences("clock.tools", Context.MODE_PRIVATE)
      for (id in (prefs.getStringSet("quiet", emptySet()) ?: emptySet()) - silenced) manager.cancel(id, QUIET)
      prefs.edit().putStringSet("quiet", silenced).apply()
      val ringing = runs.any { it.state == TimerRunRecord.RINGING && !it.silenced }
      if (!ringing && !isRunning) return
      val intent = Intent(context, TimerService::class.java)
      try {
        if (ringing && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } catch (error: Exception) {
        Log.e("ClockTimer", "ringing service refused", error)
      }
    }

    internal fun channels(context: Context, words: ToolWords) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      manager.createNotificationChannel(
          NotificationChannel(CHANNEL_RINGING, words.channelTimersRinging, NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setShowBadge(false)
          },
      )
    }

    private fun window(context: Context): PendingIntent {
      val unlocked = context.getSystemService(UserManager::class.java)?.isUserUnlocked != false
      // Before the first unlock React Native cannot run: the notification's own buttons answer then.
      if (!unlocked) return TimerEngine.openTimers(context, 22)
      return PendingIntent.getActivity(
          context,
          23,
          Intent(context, TimerRingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun stopAll(context: Context): PendingIntent =
        PendingIntent.getBroadcast(context, 24, Intent(context, ToolReceiver::class.java).setAction(ToolReceiver.ACTION_STOP_RINGING), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** The ringing notification: « Temps écoulé » (or how many), the timers' names, the time since the end counting up. */
    internal fun notification(context: Context, ringing: List<TimerRunRecord>): Notification {
      val words = ToolStore(context).words(context)
      channels(context, words)
      val newest = ringing.maxBy { it.endsAt }
      val one = ringing.size == 1
      val window = window(context)
      val builder =
          NotificationCompat.Builder(context, CHANNEL_RINGING)
              .setSmallIcon(R.drawable.ic_stat_timer)
              .setContentTitle(if (one) words.timeUp else words.timersUp.replace("{count}", ringing.size.toString()))
              .setContentText(ringing.joinToString(" · ") { TimerEngine.name(it, words) })
              .setCategory(NotificationCompat.CATEGORY_ALARM)
              .setPriority(NotificationCompat.PRIORITY_MAX)
              .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
              .setOngoing(true)
              .setAutoCancel(false)
              .setUsesChronometer(true)
              .setWhen(ringing.minOf { it.endsAt })
              .setShowWhen(true)
              .setFullScreenIntent(window, true)
              .setContentIntent(window)
              .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      if (one) builder.addAction(0, words.addMinute, TimerEngine.action(context, newest.id, "add")).addAction(0, words.stop, TimerEngine.action(context, newest.id, "stop"))
      else builder.addAction(0, words.stop, stopAll(context))
      return builder.build()
    }

    /** A ring fallen silent: said, quietly, until it is stopped. */
    private fun quiet(context: Context, run: TimerRunRecord) {
      val words = ToolStore(context).words(context)
      TimerEngine.channels(context, words)
      val notification =
          NotificationCompat.Builder(context, "clock.timers")
              .setSmallIcon(R.drawable.ic_stat_timer)
              .setContentTitle(words.timeUp)
              .setContentText(TimerEngine.name(run, words))
              .setCategory(NotificationCompat.CATEGORY_STATUS)
              .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
              .setWhen(run.endsAt)
              .setShowWhen(true)
              .setContentIntent(TimerEngine.openTimers(context, 25))
              .setDeleteIntent(TimerEngine.action(context, run.id, "stop"))
              .addAction(0, words.stop, TimerEngine.action(context, run.id, "stop"))
              .build()
      try {
        NotificationManagerCompat.from(context).notify(run.id, QUIET, notification)
      } catch (_: SecurityException) {}
    }
  }
}
