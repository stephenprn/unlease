package com.stephenprn.contacts

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.stephenprn.unlease.launch.LaunchIntents
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.contacts.intake.IntakeModule

class MainActivity : ReactActivity() {

  /**
   * Parks a launch share (a contact card) for JavaScript. Only on a real launch (null
   * `savedInstanceState`): a recreation (rotation, theme change) must not deliver the same card twice.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    // Brought back (Recents, or Android recreating it), the intent that first opened the task is not followed again.
    val replayed = LaunchIntents.forgetReplayed(this, savedInstanceState)
    super.onCreate(savedInstanceState)
    if (!replayed) IntakeModule.receive(this, intent)
  }

  /** singleTask: a link (`unlease-contacts://contact/<id>`), a widget tap or a shared card while the app is open arrives here. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    IntakeModule.receive(this, intent)
  }

  /** The root `index.js` registers (`app.json`). */
  override fun getMainComponentName(): String = "Contacts"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
