package com.stephenprn.unlease.backgroundsync

import android.Manifest
import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeBackgroundSyncSpec

/** JavaScript's side of `BackgroundSync`: what it knows, how a run went, and what Android holds back. */
class BackgroundSyncModule(reactContext: ReactApplicationContext) : NativeBackgroundSyncSpec(reactContext) {
  override fun configure(on: Boolean) {
    BackgroundSync.configure(reactApplicationContext, on)
  }

  override fun note(pending: Double, lastSyncAt: Double) {
    BackgroundSync.note(reactApplicationContext, pending.toInt(), lastSyncAt.toLong())
  }

  override fun soon(delaySeconds: Double) {
    BackgroundSync.soon(reactApplicationContext, maxOf(0L, delaySeconds.toLong()))
  }

  override fun report(outcome: String) {
    BackgroundSync.report(reactApplicationContext, outcome)
  }

  override fun health(promise: Promise) {
    val context = reactApplicationContext
    val activity = context.getSystemService(ActivityManager::class.java)
    val power = context.getSystemService(PowerManager::class.java)
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    promise.resolve(
        Arguments.createMap().apply {
          putBoolean("restricted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activity?.isBackgroundRestricted == true)
          putBoolean("unrestricted", power?.isIgnoringBatteryOptimizations(context.packageName) == true)
          putBoolean("dataSaver", connectivity?.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED)
        },
    )
  }

  override fun open(what: String, promise: Promise) {
    val context = reactApplicationContext
    val pkg = Uri.parse("package:${context.packageName}")
    val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    val asks = context.packageManager.checkPermission(Manifest.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, context.packageName) == PackageManager.PERMISSION_GRANTED
    val intent =
        when (what) {
          // Android's own question when the app may ask it, else the list where it is set by hand.
          "unrestricted" -> if (asks) Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg) else Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
          // « Utilisation des données sans restriction », for this app.
          "data" -> Intent(Settings.ACTION_IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS, pkg)
          // The app's page, where « Batterie » leaves « Restreinte ».
          else -> details
        }
    promise.resolve(start(intent) || start(details))
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
}
