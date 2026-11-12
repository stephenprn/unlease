package com.stephenprn.unlease.backgroundsync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * A network came up (the watch's `PendingIntent`, which only this app can send), or the phone
 * restarted, or the app was updated (protected broadcasts only Android sends): not exported.
 */
class SyncReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      BackgroundSync.ACTION_NETWORK -> BackgroundSync.onNetwork(context)
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED -> BackgroundSync.onSystemChange(context)
    }
  }
}
