package com.stephenprn.unlease.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.unlease.specs.NativeUnleaseClipboardSpec

/** The clipboard, for every app of the suite: read only while focused (Android's rule), from the UI thread. */
class ClipboardModule(private val reactContext: ReactApplicationContext) : NativeUnleaseClipboardSpec(reactContext) {

  override fun readText(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve("")
      return
    }
    activity.runOnUiThread {
      val text =
          try {
            val clipboard = reactContext.getSystemService(ClipboardManager::class.java)
            clipboard?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(reactContext)?.toString() ?: ""
          } catch (_: SecurityException) {
            ""
          }
      promise.resolve(text)
    }
  }

  override fun writeText(text: String, promise: Promise) {
    val write = {
      val copied =
          try {
            val clipboard = reactContext.getSystemService(ClipboardManager::class.java)
            clipboard?.setPrimaryClip(ClipData.newPlainText("text", text))
            clipboard != null
          } catch (_: SecurityException) {
            false
          }
      promise.resolve(copied)
    }
    val activity = reactContext.currentActivity
    if (activity != null) activity.runOnUiThread { write() } else write()
  }
}
