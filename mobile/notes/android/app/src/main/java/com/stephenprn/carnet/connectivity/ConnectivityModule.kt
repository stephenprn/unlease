package com.stephenprn.carnet.connectivity

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.carnet.specs.NativeConnectivitySpec

/** The default network coming and going: sync resumes the moment one reaches the internet again. */
class ConnectivityModule(reactContext: ReactApplicationContext) : NativeConnectivitySpec(reactContext) {
  private var callback: ConnectivityManager.NetworkCallback? = null

  override fun start() {
    if (callback != null) return
    val manager = reactApplicationContext.getSystemService(ConnectivityManager::class.java) ?: return
    val listener =
        object : ConnectivityManager.NetworkCallback() {
          override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) emit(true)
          }

          override fun onLost(network: Network) = emit(false)
        }
    manager.registerDefaultNetworkCallback(listener)
    callback = listener
  }

  private fun emit(online: Boolean) {
    emitOnChange(Arguments.createMap().apply { putBoolean("online", online) })
  }

  override fun invalidate() {
    callback?.let { reactApplicationContext.getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) }
    callback = null
    super.invalidate()
  }
}
