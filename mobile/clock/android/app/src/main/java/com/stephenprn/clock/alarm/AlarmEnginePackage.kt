package com.stephenprn.clock.alarm

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeAlarmEngineSpec

/** Clock's alarm engine, registered by Clock's app alone. */
class AlarmEnginePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeAlarmEngineSpec.NAME) AlarmEngineModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeAlarmEngineSpec.NAME to ReactModuleInfo(NativeAlarmEngineSpec.NAME, AlarmEngineModule::class.java.name, false, false, false, true))
  }
}
