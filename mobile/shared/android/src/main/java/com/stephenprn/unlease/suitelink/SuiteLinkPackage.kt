package com.stephenprn.unlease.suitelink

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeSuiteLinkSpec

class SuiteLinkPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeSuiteLinkSpec.NAME) SuiteLinkModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeSuiteLinkSpec.NAME to ReactModuleInfo(NativeSuiteLinkSpec.NAME, SuiteLinkModule::class.java.name, false, false, false, true))
  }
}
