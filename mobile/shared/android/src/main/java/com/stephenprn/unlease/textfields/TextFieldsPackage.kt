package com.stephenprn.unlease.textfields

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeTextFieldsSpec

/** Lazy: nothing to set up until the first field that grows. */
class TextFieldsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeTextFieldsSpec.NAME) TextFieldsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeTextFieldsSpec.NAME to ReactModuleInfo(NativeTextFieldsSpec.NAME, TextFieldsModule::class.java.name, false, false, false, true))
  }
}
