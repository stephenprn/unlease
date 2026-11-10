package com.stephenprn.unlease.reminders

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.ApplicationExitInfo
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeRemindersSpec

/** What keeps the notifications on time (`specs/NativeReminders.ts`). */
class RemindersModule(reactContext: ReactApplicationContext) : NativeRemindersSpec(reactContext) {
  override fun health(promise: Promise) {
    val context = reactApplicationContext
    val alarms = context.getSystemService(AlarmManager::class.java)
    val activity = context.getSystemService(ActivityManager::class.java)
    val power = context.getSystemService(PowerManager::class.java)
    promise.resolve(
        Arguments.createMap().apply {
          putBoolean("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled())
          putBoolean("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms?.canScheduleExactAlarms() != false)
          putBoolean("backgroundRestricted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activity?.isBackgroundRestricted == true)
          putBoolean("unrestricted", power?.isIgnoringBatteryOptimizations(context.packageName) == true)
        },
    )
  }

  override fun stoppedBefore(promise: Promise) {
    promise.resolve(stopped ?: wasStopped(reactApplicationContext).also { stopped = it })
  }

  override fun open(what: String, promise: Promise) {
    val context = reactApplicationContext
    val pkg = Uri.parse("package:${context.packageName}")
    val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    val intent =
        when (what) {
          "notifications" ->
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) else details
          "exactAlarms" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else details
          // Android's own question: « Autoriser l'application à toujours s'exécuter en arrière-plan ? »
          "unrestricted" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
          // The app's page, where « Utilisation de la batterie » leaves « Restreinte ».
          else -> details
        }
    promise.resolve(start(intent) || start(details))
  }

  override fun keepFresh(minutes: Double) {
    RemindersRefresh.keepFresh(reactApplicationContext, minutes.toInt())
  }

  private fun start(intent: Intent): Boolean {
    val activity = reactApplicationContext.currentActivity
    return try {
      if (activity != null) activity.startActivity(intent) else reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: SecurityException) {
      false
    }
  }

  companion object {
    /** Asked once per process: the answer is about how it started. */
    @Volatile private var stopped: Boolean? = null

    /**
     * Whether the app was force-stopped before this process started: Android then took every alarm
     * away, Notifee's included, though their records remain. Android 15 says so; from Android 11 the
     * last process's end says « at the person's request » (Réglages' « Forcer l'arrêt »); before, nobody
     * says, so yes (arming everything again costs a moment).
     */
    private fun wasStopped(context: Context): Boolean {
      val activity = context.getSystemService(ActivityManager::class.java) ?: return true
      return try {
        when {
          Build.VERSION.SDK_INT >= 35 -> activity.getHistoricalProcessStartReasons(1).firstOrNull()?.wasForceStopped() ?: false
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
              activity.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()?.reason == ApplicationExitInfo.REASON_USER_REQUESTED
          else -> true
        }
      } catch (_: Exception) {
        true
      }
    }
  }
}
