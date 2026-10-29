package com.stephenprn.carnet

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.stephenprn.carnet.haptics.HapticsPackage
import com.stephenprn.carnet.connectivity.ConnectivityPackage
import com.stephenprn.carnet.intake.IntakePackage
import com.stephenprn.carnet.media.MediaPackage
import com.stephenprn.carnet.organic.OrganicPackage
import com.stephenprn.carnet.widget.Widgets
import com.stephenprn.carnet.widget.WidgetsPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Local modules are not autolinked: autolinking only walks node_modules.
          add(IntakePackage())
          add(MediaPackage())
          add(HapticsPackage())
          add(ConnectivityPackage())
          add(OrganicPackage())
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
