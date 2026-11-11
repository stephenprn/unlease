package com.stephenprn.carnet.shortcuts

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeShortcutsSpec

/** Lazy: made the first time JavaScript publishes the sharing shortcuts. */
class ShortcutsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeShortcutsSpec.NAME) ShortcutsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeShortcutsSpec.NAME to ReactModuleInfo(NativeShortcutsSpec.NAME, ShortcutsModule::class.java.name, false, false, false, true))
  }
}
