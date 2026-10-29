package com.stephenprn.carnet.media

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.carnet.specs.NativeMediaSpec

/** Lazy: its activity listener should not exist until a picker is wanted. */
class MediaPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeMediaSpec.NAME) MediaModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeMediaSpec.NAME to ReactModuleInfo(NativeMediaSpec.NAME, MediaModule::class.java.name, false, false, false, true))
  }
}
