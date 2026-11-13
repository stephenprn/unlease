package com.stephenprn.contacts.mirror

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.stephenprn.contacts.BuildConfig

/**
 * « Ouvrir dans Contacts », the row every copied person carries in the phone's own contacts app
 * (`PhoneMirrorModule.MIME_PROFILE`): Android hands its address here, the person's id is read from
 * it (only from a row of this app's account), and the app opens on them through its own link
 * (`unlease-contacts://contact/<id>`), as a launcher shortcut's (`ShortcutActivity`). It never shows.
 */
class ContactOpenActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val data = intent?.data
    if (data == null || savedInstanceState != null) {
      finish()
      return
    }
    val context = applicationContext
    Thread {
      val id = try {
        PhoneMirrorModule.contactIdOf(context, data)
      } catch (_: Exception) {
        null
      }
      runOnUiThread {
        val link = if (id != null) "${BuildConfig.APP_SCHEME}://contact/${Uri.encode(id)}" else "${BuildConfig.APP_SCHEME}://"
        try {
          startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
          // Nothing answers: the tap does nothing rather than crash.
        }
        finish()
      }
    }.start()
  }
}
