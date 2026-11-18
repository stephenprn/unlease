package com.stephenprn.clock.alarm

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.stephenprn.clock.tools.StopwatchEngine
import com.stephenprn.clock.tools.TimerEngine
import com.stephenprn.clock.tools.ToolEvents
import com.stephenprn.clock.tools.ToolsSnapshot
import com.stephenprn.unlease.specs.NativeAlarmEngineSpec
import java.util.concurrent.atomic.AtomicReference

/** Clock's alarm engine, as JavaScript reaches it (`specs/NativeAlarmEngine.ts`). */
class AlarmEngineModule(private val context: ReactApplicationContext) : NativeAlarmEngineSpec(context), ActivityEventListener {
  private val picking = AtomicReference<Promise?>(null)
  private val listener: (RingSnapshot) -> Unit = { snapshot -> emitOnRing(toMap(snapshot)) }
  private val toolListener: (ToolsSnapshot) -> Unit = { snapshot -> emitOnTools(toolsMap(snapshot)) }

  init {
    context.addActivityEventListener(this)
    RingEvents.add(listener)
    ToolEvents.add(toolListener)
    // A ring the store holds with no service ringing it (the process died mid-ring): rung again, or said missed.
    AlarmScheduler.checkRing(context)
  }

  override fun invalidate() {
    context.removeActivityEventListener(this)
    RingEvents.remove(listener)
    ToolEvents.remove(toolListener)
    SoundPreview.stop()
    picking.getAndSet(null)?.resolve(sound("", ""))
    super.invalidate()
  }

  override fun setPlan(plan: String, promise: Promise) {
    val store = AlarmStore(context)
    val before = store.plan()
    store.savePlan(plan)
    // A new alarm, one whose ringing changed, or all of them when this phone starts ringing again: none
    // of their rings before now is theirs (a restart would ring it, or say it missed).
    val now = System.currentTimeMillis()
    for (alarm in store.plan().alarms) {
      val old = before.alarm(alarm.id)
      if (!before.settings.ringsHere || old == null || old.minute != alarm.minute || old.days != alarm.days || old.date != alarm.date || old.skipDay != alarm.skipDay) store.setFired(alarm.id, now)
    }
    RingNotifications.channels(context, store.plan().settings.words)
    val outcome = AlarmScheduler.arm(context)
    promise.resolve(
        Arguments.createMap().apply {
          putInt("armed", outcome.armed)
          putDouble("next", outcome.next.toDouble())
          putBoolean("inexact", outcome.inexact)
        },
    )
  }

  override fun ringing(promise: Promise) {
    AlarmScheduler.checkRing(context)
    promise.resolve(toMap(RingSnapshot.read(context)))
  }

  override fun snooze() {
    if (AlarmStore(context).ring() != null) RingService.send(context, RingService.ACTION_SNOOZE)
  }

  override fun stop() {
    val store = AlarmStore(context)
    if (store.ring() != null) {
      RingService.send(context, RingService.ACTION_STOP)
      return
    }
    for (snooze in store.snoozes()) {
      store.clearSnooze(snooze.record.alarm.id)
      RingNotifications.cancelSnoozed(context, snooze.record.alarm.id)
    }
    AlarmScheduler.arm(context)
    RingEvents.changed(context)
  }

  override fun ringIn(seconds: Double, title: String, sound: String) {
    val store = AlarmStore(context)
    val at = System.currentTimeMillis() + (seconds * 1000).toLong().coerceAtLeast(1000L)
    store.setTest(PlannedAlarm(AlarmStore.TEST_ID, 0, 0, null, null, title, "", sound.ifEmpty { Sounds.DEFAULT }, true), at)
    AlarmScheduler.arm(context)
  }

  override fun health(promise: Promise) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    val notifications = context.getSystemService(NotificationManager::class.java)
    val audio = context.getSystemService(AudioManager::class.java)
    val activity = context.getSystemService(ActivityManager::class.java)
    promise.resolve(
        Arguments.createMap().apply {
          putBoolean("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
          putBoolean("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms?.canScheduleExactAlarms() != false)
          putBoolean("fullScreen", Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || notifications?.canUseFullScreenIntent() != false)
          putInt("volume", audio?.getStreamVolume(AudioManager.STREAM_ALARM) ?: 0)
          putInt("maxVolume", audio?.getStreamMaxVolume(AudioManager.STREAM_ALARM) ?: 0)
          putBoolean("backgroundRestricted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activity?.isBackgroundRestricted == true)
          putBoolean("ringingChannel", RingNotifications.ringingChannelOn(context))
          putBoolean("alarmsMuted", alarmsMuted(notifications))
        },
    )
  }

  /** « Ne pas déranger » on, letting no alarm through (« Silence total », or a mode without alarms). */
  private fun alarmsMuted(notifications: NotificationManager?): Boolean {
    val manager = notifications ?: return false
    return when (manager.currentInterruptionFilter) {
      NotificationManager.INTERRUPTION_FILTER_NONE -> true
      NotificationManager.INTERRUPTION_FILTER_PRIORITY ->
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
              try {
                val policy = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) manager.consolidatedNotificationPolicy else manager.notificationPolicy
                policy.priorityCategories and NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS == 0
              } catch (_: Exception) {
                false
              }
      else -> false
    }
  }

  override fun open(what: String, promise: Promise) {
    val pkg = Uri.parse("package:${context.packageName}")
    val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    if (what == "volume") {
      // The system's own volume panel, on the alarm stream: the person sets it there.
      context.getSystemService(AudioManager::class.java)?.adjustStreamVolume(AudioManager.STREAM_ALARM, AudioManager.ADJUST_SAME, AudioManager.FLAG_SHOW_UI)
      promise.resolve(true)
      return
    }
    val intent =
        when (what) {
          "fullScreen" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) else details
          "exactAlarms" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else details
          "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          "ringingChannel" ->
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, RingNotifications.CHANNEL_RINGING)
              else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          "doNotDisturb" -> Intent("android.settings.ZEN_MODE_SETTINGS")
          else -> details
        }
    promise.resolve(start(intent) || start(details))
  }

  private fun start(intent: Intent): Boolean =
      try {
        val activity = context.currentActivity
        if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: ActivityNotFoundException) {
        false
      } catch (_: SecurityException) {
        false
      }

  override fun preview(sound: String) {
    SoundPreview.play(context, sound)
  }

  override fun stopPreview() {
    SoundPreview.stop()
  }

  override fun pickSound(current: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.resolve(sound("", ""))
      return
    }
    picking.getAndSet(promise)?.resolve(sound("", ""))
    val intent =
        Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Sounds.phoneUri(current))
    try {
      activity.startActivityForResult(intent, REQUEST_SOUND)
    } catch (_: ActivityNotFoundException) {
      picking.getAndSet(null)?.resolve(sound("", ""))
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_SOUND) return
    val promise = picking.getAndSet(null) ?: return
    val uri: Uri? =
        if (resultCode == Activity.RESULT_OK) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
          else @Suppress("DEPRECATION") data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
        } else null
    if (uri == null) {
      promise.resolve(sound("", ""))
      return
    }
    val name = try {
      RingtoneManager.getRingtone(context, uri)?.getTitle(context) ?: ""
    } catch (_: Exception) {
      ""
    }
    promise.resolve(sound(uri.toString(), name))
  }

  override fun onNewIntent(intent: Intent) {}

  override fun whereabouts(promise: Promise) {
    val granted =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val manager = context.getSystemService(LocationManager::class.java)
    val best =
        if (!granted || manager == null) null
        else
            try {
              // The last place any provider knew (no Google service): fresh enough for a forecast, asked of nothing.
              manager.getProviders(true).mapNotNull { manager.getLastKnownLocation(it) }.maxByOrNull { it.time }
            } catch (_: SecurityException) {
              null
            }
    promise.resolve(
        Arguments.createMap().apply {
          putBoolean("found", best != null)
          putDouble("lat", best?.latitude ?: 0.0)
          putDouble("lon", best?.longitude ?: 0.0)
          putDouble("at", (best?.time ?: 0L).toDouble())
        },
    )
  }

  override fun unlock(promise: Promise) {
    val activity = context.currentActivity
    val keyguard = context.getSystemService(KeyguardManager::class.java)
    if (activity == null || keyguard == null || !keyguard.isKeyguardLocked || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(keyguard?.isKeyguardLocked != true)
      return
    }
    keyguard.requestDismissKeyguard(
        activity,
        object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() = promise.resolve(true)

          override fun onDismissCancelled() = promise.resolve(false)

          override fun onDismissError() = promise.resolve(false)
        },
    )
  }

  private fun sound(uri: String, name: String): WritableMap =
      Arguments.createMap().apply {
        putString("uri", uri)
        putString("name", name)
      }

  private fun toMap(snapshot: RingSnapshot): WritableMap =
      Arguments.createMap().apply {
        val record = snapshot.record
        putString("state", snapshot.state)
        putString("id", record?.alarm?.id ?: "")
        putDouble("at", (record?.at ?: 0L).toDouble())
        putDouble("since", (record?.since ?: 0L).toDouble())
        putDouble("until", snapshot.until.toDouble())
        putInt("snoozes", record?.snoozes ?: 0)
        putString("title", record?.alarm?.title ?: "")
        putString("label", record?.alarm?.label ?: "")
      }

  override fun tools(promise: Promise) {
    promise.resolve(toolsMap(ToolsSnapshot.read(context)))
  }

  override fun startTimer(run: String) {
    TimerEngine.start(context, run)
  }

  override fun timerAction(id: String, action: String) {
    TimerEngine.act(context, id, action)
  }

  override fun stopRingingTimers() {
    TimerEngine.stopRinging(context)
  }

  override fun stopwatchAction(action: String) {
    StopwatchEngine.act(context, action)
  }

  private fun toolsMap(snapshot: ToolsSnapshot): WritableMap =
      Arguments.createMap().apply {
        putString("timers", snapshot.timers)
        putString("stopwatch", snapshot.stopwatch)
        putDouble("now", snapshot.now.toDouble())
      }

  companion object {
    private const val REQUEST_SOUND = 4721
  }
}
