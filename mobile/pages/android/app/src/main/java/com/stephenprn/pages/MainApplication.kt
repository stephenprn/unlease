package com.stephenprn.pages

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.stephenprn.pages.intake.IntakePackage
import com.stephenprn.unlease.clipboard.ClipboardPackage
import com.stephenprn.unlease.backgroundsync.BackgroundSyncPackage
import com.stephenprn.unlease.connectivity.ConnectivityPackage
import com.stephenprn.unlease.haptics.HapticsPackage
import com.stephenprn.unlease.textfields.TextFieldsPackage
import com.stephenprn.unlease.launcher.LauncherIconPackage
import com.stephenprn.unlease.media.MediaPackage
import com.stephenprn.unlease.organic.OrganicPackage
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
          add(BackgroundSyncPackage())
          add(OrganicPackage())
          add(ClipboardPackage())
          add(SuiteLinkPackage())
          add(LauncherIconPackage())
          // Pages' own: text shared to it becomes a page.
          add(IntakePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
