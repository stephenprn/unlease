package com.stephenprn.unlease.lock

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeSuiteLockSpec

/** The suite's lock, registered by the apps that lock something (Carnet, Pages). */
class SuiteLockPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeSuiteLockSpec.NAME) SuiteLockModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeSuiteLockSpec.NAME to ReactModuleInfo(NativeSuiteLockSpec.NAME, SuiteLockModule::class.java.name, false, false, false, true))
  }
}
