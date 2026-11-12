package com.stephenprn.unlease.backgroundsync

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeBackgroundSyncSpec

/** Registered by every app of the suite: each syncs with the app closed. */
class BackgroundSyncPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeBackgroundSyncSpec.NAME) BackgroundSyncModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeBackgroundSyncSpec.NAME to ReactModuleInfo(NativeBackgroundSyncSpec.NAME, BackgroundSyncModule::class.java.name, false, false, false, true))
  }
}
