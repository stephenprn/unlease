package com.stephenprn.unlease.reminders

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeRemindersSpec

/** Registered by the suite's apps that ring (Carnet, Contacts, Agenda), whose build adds `src/reminders`. */
class RemindersPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeRemindersSpec.NAME) RemindersModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeRemindersSpec.NAME to ReactModuleInfo(NativeRemindersSpec.NAME, RemindersModule::class.java.name, false, false, false, true))
  }
}
