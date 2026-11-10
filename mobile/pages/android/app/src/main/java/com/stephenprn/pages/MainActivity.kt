package com.stephenprn.pages

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.unlease.launch.LaunchIntents

class MainActivity : ReactActivity() {

  /** Brought back (Recents, or Android recreating it), the link that first opened the task is not followed again. */
  override fun onCreate(savedInstanceState: Bundle?) {
    LaunchIntents.forgetReplayed(this, savedInstanceState)
    super.onCreate(savedInstanceState)
  }

  /** singleTask: a link (`unlease-pages://page/<id>`) tapped while the app is open arrives here. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  /** The root `index.js` registers (`app.json`). */
  override fun getMainComponentName(): String = "Pages"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
