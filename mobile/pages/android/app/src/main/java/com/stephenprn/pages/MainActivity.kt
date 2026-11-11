package com.stephenprn.pages

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.pages.intake.IntakeModule
import com.stephenprn.unlease.launch.LaunchIntents

class MainActivity : ReactActivity() {

  /**
   * Parks a launch share (text to make a page of) for JavaScript. Brought back (Recents, or Android
   * recreating it), the link or the share that first opened the task is not followed again.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    val replayed = LaunchIntents.forgetReplayed(this, savedInstanceState)
    super.onCreate(savedInstanceState)
    if (!replayed) IntakeModule.receive(intent)
  }

  /** singleTask: a link (`unlease-pages://page/<id>`) tapped or text shared while the app is open arrives here. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    IntakeModule.receive(intent)
  }

  /** The root `index.js` registers (`app.json`). */
  override fun getMainComponentName(): String = "Pages"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
