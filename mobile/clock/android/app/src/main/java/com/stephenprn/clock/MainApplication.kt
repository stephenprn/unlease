package com.stephenprn.clock

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.UserManager
import androidx.core.content.ContextCompat
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import android.util.Log
import com.stephenprn.clock.alarm.AlarmEnginePackage
import com.stephenprn.clock.alarm.RingService
import com.stephenprn.clock.intake.IntakePackage
import com.stephenprn.unlease.backgroundsync.BackgroundSyncPackage
import com.stephenprn.unlease.clipboard.ClipboardPackage
import com.stephenprn.unlease.connectivity.ConnectivityPackage
import com.stephenprn.unlease.haptics.HapticsPackage
import com.stephenprn.unlease.launcher.LauncherIconPackage
import com.stephenprn.unlease.maps.MapAppsPackage
import com.stephenprn.unlease.media.MediaPackage
import com.stephenprn.unlease.organic.OrganicPackage
import com.stephenprn.unlease.reminders.RemindersPackage
import com.stephenprn.unlease.suitelink.SuiteLinkPackage
import com.stephenprn.clock.widget.WidgetsPackage
import com.stephenprn.unlease.overlays.OverlaysPackage
import com.stephenprn.unlease.textfields.TextFieldsPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Local modules are not autolinked: autolinking only walks node_modules.
          // The suite's own (mobile/shared/android), as every app of it registers them:
          add(MediaPackage())
          add(HapticsPackage())
          add(TextFieldsPackage())
          add(OverlaysPackage())
          add(ConnectivityPackage())
          add(BackgroundSyncPackage())
          add(OrganicPackage())
          add(ClipboardPackage())
          add(SuiteLinkPackage())
          add(LauncherIconPackage())
          add(MapAppsPackage())
          // Those of the apps that ring (mobile/shared/android/src/reminders): the evening check and the notice before an alarm.
          add(RemindersPackage())
          // Clock's own (this app's Kotlin): the alarm engine, another app's « set an alarm ».
          add(AlarmEnginePackage())
          add(IntakePackage())
          // Its home-screen widget « Prochaine alarme » (widget/): JavaScript hands it each morning's words.
          add(WidgetsPackage())
        },
      // A JavaScript error while an alarm rings (its window runs here too) must not take the sound
      // with it: said in the log, the ringing service goes on; any other time, React Native's own way.
      exceptionHandler = { error ->
        if (RingService.isRunning) Log.e("ClockAlarm", "JavaScript failed while ringing", error) else throw error
      },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // An alarm armed before a restart rings before the phone is first unlocked (Direct Boot): this
    // process then starts for the engine alone (alarm/, Direct Boot aware), with the app's own storage
    // still sealed. React Native waits for the unlock.
    val users = getSystemService(UserManager::class.java)
    if (users == null || users.isUserUnlocked) {
      loadReactNative(this)
      return
    }
    ContextCompat.registerReceiver(
      this,
      object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          unregisterReceiver(this)
          loadReactNative(this@MainApplication)
        }
      },
      IntentFilter(Intent.ACTION_USER_UNLOCKED),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
  }
}
