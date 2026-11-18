package com.stephenprn.wallet.vault

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.stephenprn.unlease.specs.NativeWalletVaultSpec

/** Wallet's vault, registered by Wallet's app alone. */
class WalletVaultPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == NativeWalletVaultSpec.NAME) WalletVaultModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(NativeWalletVaultSpec.NAME to ReactModuleInfo(NativeWalletVaultSpec.NAME, WalletVaultModule::class.java.name, false, false, false, true))
  }
}
