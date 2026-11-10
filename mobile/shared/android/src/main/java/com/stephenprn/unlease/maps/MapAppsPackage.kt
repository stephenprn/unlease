package com.stephenprn.unlease.maps

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeMapAppsSpec

class MapAppsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeMapAppsSpec.NAME) MapAppsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeMapAppsSpec.NAME to ReactModuleInfo(NativeMapAppsSpec.NAME, MapAppsModule::class.java.name, false, false, false, true))
  }
}
