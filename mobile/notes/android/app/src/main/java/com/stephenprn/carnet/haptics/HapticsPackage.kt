package com.stephenprn.carnet.haptics

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.carnet.specs.NativeHapticsSpec

/** Lazy: nothing to set up until the first click. */
class HapticsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeHapticsSpec.NAME) HapticsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeHapticsSpec.NAME to ReactModuleInfo(NativeHapticsSpec.NAME, HapticsModule::class.java.name, false, false, false, true))
  }
}
