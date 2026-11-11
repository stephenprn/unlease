package com.stephenprn.unlease.launch

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle

/**
 * Where the launcher's static shortcuts land (each app's `res/xml/shortcuts.xml`). Android opens a
 * static shortcut with NEW_TASK and CLEAR_TASK, which would close everything the app has open (the
 * note being written, the stack under it): this activity, in a task of its own (`taskAffinity=""`),
 * takes that instead, hands the shortcut's link (`carnet://capture/note`…) to MainActivity, which
 * follows it as it follows a widget's tap (singleTask: `onNewIntent` while it runs), and goes. It
 * never shows.
 */
class ShortcutActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val link = intent?.data
    if (link != null && savedInstanceState == null) {
      // Only this app's own activities answer: the link stays in the app.
      val next = Intent(Intent.ACTION_VIEW, link).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        startActivity(next)
      } catch (_: ActivityNotFoundException) {
        // A build whose links changed: the shortcut does nothing rather than crash.
      }
    }
    finish()
  }
}
