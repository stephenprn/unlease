package com.stephenprn.unlease.overlays

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeOverlaysSpec

/** Lazy: nothing to set up until the first overlay opens. */
class OverlaysPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeOverlaysSpec.NAME) OverlaysModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeOverlaysSpec.NAME to ReactModuleInfo(NativeOverlaysSpec.NAME, OverlaysModule::class.java.name, false, false, false, true))
  }
}
