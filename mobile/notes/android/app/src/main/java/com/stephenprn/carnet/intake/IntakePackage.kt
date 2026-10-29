package com.stephenprn.carnet.intake

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.carnet.specs.NativeIntakeSpec

/** Eager, so a share arriving while the app runs finds a module to emit through. */
class IntakePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeIntakeSpec.NAME) IntakeModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeIntakeSpec.NAME to ReactModuleInfo(NativeIntakeSpec.NAME, IntakeModule::class.java.name, false, true, false, true))
  }
}
