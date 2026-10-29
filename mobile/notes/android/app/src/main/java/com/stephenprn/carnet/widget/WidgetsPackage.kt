package com.stephenprn.carnet.widget

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.carnet.specs.NativeWidgetsSpec

class WidgetsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeWidgetsSpec.NAME) WidgetsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeWidgetsSpec.NAME to ReactModuleInfo(NativeWidgetsSpec.NAME, WidgetsModule::class.java.name, false, false, false, true))
  }
}
