package com.stephenprn.unlease.suitelink

import android.content.Context

/**
 * What this app hands its siblings of the suite (its server's address, its token, its appearance, its grain, its language, the look it sent):
 * kept in private preferences, served by [SuiteProvider] to apps signed by the same key only.
 */
object SuiteLink {
  /** The permission guarding every app's provider; `signature`: only the suite's own signer holds it. */
  const val PERMISSION = "com.stephenprn.unlease.permission.SUITE"
  const val PATH = "link"
  /** Append only: an older sibling serves the first ones alone, and a reader asks each by its name. */
  val COLUMNS = arrayOf("server", "token", "appearance", "grain", "locale", "look")

  private const val PREFERENCES = "unlease_suite"

  /** `<applicationId>.suite`: each app's provider. */
  fun authority(packageName: String): String = "$packageName.suite"

  fun store(context: Context, server: String, token: String, appearance: String, grain: String, locale: String, look: String) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .apply {
          // An empty value is no value: a phone disconnected hands nothing on.
          COLUMNS.zip(listOf(server, token, appearance, grain, locale, look)).forEach { (key, value) -> if (value.isEmpty()) remove(key) else putString(key, value) }
        }
        .apply()
  }

  fun read(context: Context): List<String> {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    return COLUMNS.map { preferences.getString(it, "") ?: "" }
  }
}
