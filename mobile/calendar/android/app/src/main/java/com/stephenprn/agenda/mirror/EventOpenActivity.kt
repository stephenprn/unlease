package com.stephenprn.agenda.mirror

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.CalendarContract
import com.stephenprn.agenda.BuildConfig

/**
 * A copied event opened from a calendar app that offers its own app (`CalendarContract`'s
 * `ACTION_HANDLE_CUSTOM_EVENT`, aimed at this package by the event's `CUSTOM_APP_PACKAGE`): the link
 * the copy carries (`unlease-agenda://event/<id>`, `PhoneMirrorModule`), followed in the app, as a
 * launcher shortcut's is (`ShortcutActivity`). Any other link opens the app's home. It never shows.
 */
class EventOpenActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) {
      val handed = intent?.getStringExtra(CalendarContract.EXTRA_CUSTOM_APP_URI).orEmpty()
      val prefix = "${BuildConfig.APP_SCHEME}://event/"
      val link = if (handed.startsWith(prefix) && handed.length > prefix.length) handed else "${BuildConfig.APP_SCHEME}://"
      try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: ActivityNotFoundException) {
        // Nothing answers: the tap does nothing rather than crash.
      }
    }
    finish()
  }
}
