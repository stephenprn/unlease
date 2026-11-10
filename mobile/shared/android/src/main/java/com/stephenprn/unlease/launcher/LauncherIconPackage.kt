package com.stephenprn.unlease.launcher

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeLauncherIconSpec

/** Lazy: the manifest's entries are read the first time they are asked for. */
class LauncherIconPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeLauncherIconSpec.NAME) LauncherIconModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeLauncherIconSpec.NAME to ReactModuleInfo(NativeLauncherIconSpec.NAME, LauncherIconModule::class.java.name, false, false, false, true))
  }
}
