package com.stephenprn.contacts.mirror

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativePhoneMirrorSpec

class PhoneMirrorPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativePhoneMirrorSpec.NAME) PhoneMirrorModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativePhoneMirrorSpec.NAME to ReactModuleInfo(NativePhoneMirrorSpec.NAME, PhoneMirrorModule::class.java.name, false, false, false, true))
  }
}
