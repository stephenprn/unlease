package com.stephenprn.unlease.suitelink

import android.content.pm.PackageManager
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.stephenprn.unlease.specs.NativeSuiteLinkSpec
import java.util.concurrent.Executors

/** JavaScript's side of [SuiteLink]: what this app shares, and what its siblings installed hold. */
class SuiteLinkModule(private val reactContext: ReactApplicationContext) : NativeSuiteLinkSpec(reactContext) {
  private val worker = Executors.newSingleThreadExecutor()

  override fun share(server: String, token: String, appearance: String, grain: String, locale: String, look: String) {
    worker.execute { SuiteLink.store(reactContext, server, token, appearance, grain, locale, look) }
  }

  override fun ownPackage(): String = reactContext.packageName

  override fun siblings(packages: ReadableArray, promise: Promise) {
    val names = (0 until packages.size()).mapNotNull { packages.getString(it) }.filter { it != reactContext.packageName }.distinct()
    worker.execute {
      val links = Arguments.createArray()
      for (name in names) {
        val values = read(name) ?: continue
        if (values.all { it.isEmpty() }) continue
        links.pushMap(
            Arguments.createMap().apply {
              putString("packageName", name)
              putString("server", values[0])
              putString("token", values[1])
              putString("appearance", values[2])
              putString("grain", values[3])
              putString("locale", values[4])
              putString("look", values[5])
            },
        )
      }
      promise.resolve(Arguments.createMap().apply { putArray("links", links) })
    }
  }

  /**
   * True when the provider answering for [packageName]'s link is that package's own, signed by this
   * app's key. The provider's own permission is not enough on its own: with the sibling absent, any
   * app may declare its authority (or, installed before the suite, the permission itself), and what it
   * served would be read as the connection: a server and a token that are not the person's.
   */
  private fun isSibling(packageName: String): Boolean {
    val packages = reactContext.packageManager
    val owner = packages.resolveContentProvider(SuiteLink.authority(packageName), 0)?.packageName ?: return false
    return owner == packageName && packages.checkSignatures(reactContext.packageName, owner) == PackageManager.SIGNATURE_MATCH
  }

  /** A sibling's values in [SuiteLink.COLUMNS]' order ('' for a column an older build lacks), or null when it is not installed, not signed alike, or says nothing. */
  private fun read(packageName: String): List<String>? =
      try {
        if (!isSibling(packageName)) {
          null
        } else {
          query(packageName)
        }
      } catch (_: RuntimeException) {
        // Not signed alike (SecurityException), not installed or no provider (IllegalArgumentException, null).
        null
      }

  private fun query(packageName: String): List<String>? {
    val uri = Uri.parse("content://${SuiteLink.authority(packageName)}/${SuiteLink.PATH}")
    return reactContext.contentResolver.query(uri, SuiteLink.COLUMNS, null, null, null)?.use { cursor ->
      if (!cursor.moveToFirst()) {
        null
      } else {
        SuiteLink.COLUMNS.map { name -> cursor.getColumnIndex(name).let { at -> if (at < 0) "" else cursor.getString(at) ?: "" } }
      }
    }
  }

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }
}
