package com.stephenprn.contacts.phone

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativePhoneContactsSpec

class PhoneContactsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativePhoneContactsSpec.NAME) PhoneContactsModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativePhoneContactsSpec.NAME to ReactModuleInfo(NativePhoneContactsSpec.NAME, PhoneContactsModule::class.java.name, false, false, false, true))
  }
}
