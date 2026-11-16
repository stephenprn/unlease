package com.stephenprn.clock.alarm

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ServiceCompat

/**
 * An alarm ringing: a foreground service (Android 14's `systemExempted` type, which an app holding
 * exact alarms may use for its alarms, `mediaPlayback` before), started by the ring's own exact
 * alarm, which Android allows from the background. It shows the ringing notification at once, plays
 * the sound and vibrates (`Klaxon`), holds the phone awake, and stops on « Arrêter », snoozes on
 * « Répéter », or gives up once `silenceAfter` has passed and says the alarm was missed. Another alarm
 * coming while one rings takes its place, and the first is said missed. Direct Boot aware, not exported.
 */
class RingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var klaxon: Klaxon? = null
  private var current: RingRecord? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val giveUp = Runnable { missed() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> begin(intent)
      ACTION_SNOOZE -> snooze()
      ACTION_STOP -> stop()
      else -> if (current == null) stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun begin(intent: Intent) {
    val store = AlarmStore(this)
    val settings = store.plan().settings
    val alarm = PlannedAlarm.fromJson(intent.getStringExtra(EXTRA_ALARM)?.let { org.json.JSONObject(it) })
    // A ring started again by the watch keeps when it began, so its ringing time is not counted twice.
    val since = intent.getLongExtra(EXTRA_SINCE, 0L).takeIf { it > 0L } ?: System.currentTimeMillis()
    val asked = if (alarm != null) RingRecord(alarm, intent.getLongExtra(EXTRA_AT, 0L), since, intent.getIntExtra(EXTRA_SNOOZES, 0)) else null
    // Two alarms set for the same minute ring once: the one ringing goes on, the other is answered with it.
    val record = asked?.takeUnless { next -> current?.let { now -> now.alarm.id != next.alarm.id && kotlin.math.abs(now.at - next.at) < Civil.MINUTE } == true }
    // Kept before the notification: its full-screen window reads what rings as soon as it opens.
    if (record != null) store.setRing(record)
    // Foreground first, whatever happens next: Android stops a service that does not say so within seconds.
    val shown = record ?: current ?: store.ring() ?: RingRecord(PlannedAlarm(AlarmStore.TEST_ID, 0, 0, null, null, settings.words.ringing, "", Sounds.DEFAULT, true), 0L, System.currentTimeMillis(), 0)
    if (!goForeground(RingNotifications.ringing(this, shown, settings.words))) {
      // Android refused both ways: the notification that rings on its own takes over.
      RingNotifications.fallback(this, shown, settings)
      stopSelf()
      return
    }
    if (record == null) {
      if (current == null) finishRinging()
      return
    }
    current?.let { previous ->
      // A second alarm while the first rings: it takes the screen, the first is said missed.
      klaxon?.stop()
      if (previous.alarm.id != record.alarm.id) RingNotifications.missed(this, previous.alarm, previous.at, settings.words)
    }
    current = record
    hold(settings.silenceAfter)
    AlarmReceiver.releaseBridge()
    klaxon = Klaxon(this).also { it.start(record.alarm.sound, record.alarm.vibrate, settings.rampSeconds) }
    handler.removeCallbacks(giveUp)
    handler.postDelayed(giveUp, (settings.silenceAfter * Civil.MINUTE - (System.currentTimeMillis() - record.since)).coerceAtLeast(Civil.MINUTE))
    // Should this process die while it rings, the watch starts the ring again (`AlarmScheduler.checkRing`).
    AlarmScheduler.watch(this)
    RingEvents.changed(this)
    // Clock itself in front: while the phone is in use Android shows the full-screen intent as a
    // heads-up only (and not at all when heads-ups are off), so the window opens itself; an app in
    // front may start its own activities.
    if (com.stephenprn.clock.MainActivity.inFront) runCatching { startActivity(RingNotifications.windowIntent(this)) }
  }

  /** True once the service is in the foreground; false when Android refused both types. */
  private fun goForeground(notification: android.app.Notification): Boolean {
    val type =
        when {
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
          else -> 0
        }
    try {
      ServiceCompat.startForeground(this, RingNotifications.ID_RINGING, notification, type)
      return true
    } catch (error: Exception) {
      // An app without exact alarms may not use `systemExempted`: media playback is the alarm's sound, too.
      Log.w("ClockAlarm", "foreground as $type refused", error)
    }
    return try {
      ServiceCompat.startForeground(this, RingNotifications.ID_RINGING, notification, if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0)
      true
    } catch (error: Exception) {
      Log.e("ClockAlarm", "foreground refused", error)
      false
    }
  }

  private fun hold(minutes: Int) {
    val power = getSystemService(PowerManager::class.java) ?: return
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "clock:ringing").apply {
      setReferenceCounted(false)
      acquire((minutes + 1) * Civil.MINUTE)
    }
  }

  /** The ring that rings now, or the one a restart left behind (a notification's button pressed after the process went). */
  private fun answering(): RingRecord? = current ?: AlarmStore(this).ring()

  private fun snooze() {
    val record = answering() ?: return finishRinging()
    val store = AlarmStore(this)
    // Deleted or switched off while it rang: nothing to ring again, « Répéter » is « Arrêter ».
    if (record.alarm.id != AlarmStore.TEST_ID && store.plan().alarm(record.alarm.id) == null) return stop()
    val settings = store.plan().settings
    val until = System.currentTimeMillis() + settings.snoozeMinutes * Civil.MINUTE
    store.setSnooze(record.copy(snoozes = record.snoozes + 1), until)
    finishRinging()
    RingNotifications.snoozed(this, record, until, settings.words)
    AlarmScheduler.arm(this)
    RingEvents.changed(this)
  }

  private fun stop() {
    val record = answering()
    if (record != null) {
      AlarmStore(this).clearSnooze(record.alarm.id)
      RingNotifications.cancelSnoozed(this, record.alarm.id)
    }
    finishRinging()
    AlarmScheduler.arm(this)
    RingEvents.changed(this)
  }

  private fun missed() {
    val record = current ?: return finishRinging()
    finishRinging()
    RingNotifications.missed(this, record.alarm, record.at, AlarmStore(this).plan().settings.words)
    RingEvents.changed(this)
  }

  /** Silence, the notification gone, the phone free to sleep, the service ended. */
  private fun finishRinging() {
    handler.removeCallbacks(giveUp)
    klaxon?.stop()
    klaxon = null
    val store = AlarmStore(this)
    (current ?: store.ring())?.let { RingNotifications.cancelFallback(this, it.alarm.id) }
    current = null
    store.clearRing()
    AlarmScheduler.unwatch(this)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    AlarmReceiver.releaseBridge()
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
    const val ACTION_START = "com.stephenprn.clock.alarm.START"
    const val ACTION_SNOOZE = "com.stephenprn.clock.alarm.SNOOZE"
    const val ACTION_STOP = "com.stephenprn.clock.alarm.STOP"
    private const val EXTRA_ALARM = "alarm"
    private const val EXTRA_AT = "at"
    private const val EXTRA_SNOOZES = "snoozes"
    private const val EXTRA_SINCE = "since"

    /** Whether the service lives in this process (a ring in the store without it was cut short). */
    @Volatile var isRunning = false
      private set

    /**
     * Starts ringing. Started by a ring's exact alarm (or a restart's recovery), which Android lets
     * start a foreground service from the background; if it refuses anyway, a notification that rings
     * on its own on the alarm stream takes its place, so the alarm is heard regardless.
     */
    internal fun start(context: Context, alarm: PlannedAlarm, at: Long, snoozes: Int, since: Long = 0L) {
      val intent =
          Intent(context, RingService::class.java).setAction(ACTION_START).putExtra(EXTRA_ALARM, alarm.toJson().toString()).putExtra(EXTRA_AT, at).putExtra(EXTRA_SNOOZES, snoozes).putExtra(EXTRA_SINCE, since)
      try {
        // Android answers null when it would not start it: as refused as an exception.
        val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        checkNotNull(started) { "ringing service not started" }
      } catch (error: Exception) {
        Log.e("ClockAlarm", "ringing service refused", error)
        val store = AlarmStore(context)
        val record = RingRecord(alarm, at, since.takeIf { it > 0L } ?: System.currentTimeMillis(), snoozes)
        store.setRing(record)
        RingNotifications.fallback(context, record, store.plan().settings)
      }
    }

    /** « Répéter » or « Arrêter » from the app (the ringing window, the volume keys). */
    internal fun send(context: Context, action: String) {
      try {
        context.startService(Intent(context, RingService::class.java).setAction(action))
      } catch (error: Exception) {
        Log.w("ClockAlarm", "could not reach the ringing service", error)
      }
    }
  }
}
