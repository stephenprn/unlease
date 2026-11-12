package com.stephenprn.unlease.connectivity

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeConnectivitySpec

/**
 * Networks coming and going: sync resumes the moment one is there instead of at its next retry.
 * The default network reaching the internet, and any network coming up, a VPN's included (Android's
 * default request leaves VPNs out): a server reached only through a VPN is tried the moment it comes.
 */
class ConnectivityModule(reactContext: ReactApplicationContext) : NativeConnectivitySpec(reactContext) {
  private val callbacks = mutableListOf<ConnectivityManager.NetworkCallback>()

  override fun start() {
    if (callbacks.isNotEmpty()) return
    val manager = reactApplicationContext.getSystemService(ConnectivityManager::class.java) ?: return
    val default =
        object : ConnectivityManager.NetworkCallback() {
          override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) emit(true)
          }

          override fun onLost(network: Network) = emit(false)
        }
    val any =
        object : ConnectivityManager.NetworkCallback() {
          override fun onAvailable(network: Network) = emit(true)
        }
    val anyNetwork =
        NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()
    try {
      manager.registerDefaultNetworkCallback(default)
      callbacks.add(default)
      manager.registerNetworkCallback(anyNetwork, any)
      callbacks.add(any)
    } catch (_: Exception) {
      // Too many requests: the sync's own retries still come.
    }
  }

  private fun emit(online: Boolean) {
    emitOnChange(Arguments.createMap().apply { putBoolean("online", online) })
  }

  override fun invalidate() {
    val manager = reactApplicationContext.getSystemService(ConnectivityManager::class.java)
    for (callback in callbacks) manager?.unregisterNetworkCallback(callback)
    callbacks.clear()
    super.invalidate()
  }
}
