package com.stephenprn.carnet

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.stephenprn.carnet.intake.IntakePackage
import com.stephenprn.carnet.widget.Widgets
import com.stephenprn.carnet.widget.WidgetsPackage
import com.stephenprn.unlease.clipboard.ClipboardPackage
import com.stephenprn.unlease.connectivity.ConnectivityPackage
import com.stephenprn.unlease.haptics.HapticsPackage
import com.stephenprn.unlease.textfields.TextFieldsPackage
import com.stephenprn.unlease.launcher.LauncherIconPackage
import com.stephenprn.unlease.media.MediaPackage
import com.stephenprn.unlease.organic.OrganicPackage
import com.stephenprn.unlease.reminders.RemindersPackage
import com.stephenprn.unlease.suitelink.SuiteLinkPackage

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
          add(ConnectivityPackage())
          add(OrganicPackage())
          add(ClipboardPackage())
          add(SuiteLinkPackage())
          add(LauncherIconPackage())
          // Those of the apps that ring (mobile/shared/android/src/reminders): the reminders kept on time.
          add(RemindersPackage())
          // Carnet's own:
          add(IntakePackage())
          add(WidgetsPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }

  /** The widgets' titles are images set at the type size of the moment (WidgetType): a new font size or theme draws them again. */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    Widgets.redrawEverything(this)
  }
}
