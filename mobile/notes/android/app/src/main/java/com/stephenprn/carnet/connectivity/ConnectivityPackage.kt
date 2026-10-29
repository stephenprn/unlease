package com.stephenprn.carnet.connectivity

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.carnet.specs.NativeConnectivitySpec

/** Lazy: nothing listens until sync starts it. */
class ConnectivityPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeConnectivitySpec.NAME) ConnectivityModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeConnectivitySpec.NAME to ReactModuleInfo(NativeConnectivitySpec.NAME, ConnectivityModule::class.java.name, false, false, false, true))
  }
}
