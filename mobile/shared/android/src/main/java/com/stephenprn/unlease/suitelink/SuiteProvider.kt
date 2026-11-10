package com.stephenprn.unlease.suitelink

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri

/**
 * Serves [SuiteLink]'s values, read-only, at `content://<applicationId>.suite/link`. The manifest
 * guards it with the signature permission; [query] checks the caller's signature again, so a token
 * never leaves for an app signed by another key, whatever the manifest says.
 */
class SuiteProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
    val context = context ?: return null
    if (uri.lastPathSegment != SuiteLink.PATH) return null
    val caller = callingPackage ?: return null
    if (caller != context.packageName && context.packageManager.checkSignatures(context.packageName, caller) != PackageManager.SIGNATURE_MATCH) {
      throw SecurityException("not signed by the suite's key")
    }
    return MatrixCursor(SuiteLink.COLUMNS).apply { addRow(SuiteLink.read(context).toTypedArray()) }
  }

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
}
