package com.stephenprn.carnet

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.stephenprn.unlease.launch.LaunchIntents
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.carnet.intake.IntakeModule

class MainActivity : ReactActivity() {

  /**
   * Parks a launch share for JavaScript. Only on a real launch (null `savedInstanceState`):
   * a recreation (rotation, theme change) must not deliver the same share twice.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    // Brought back (Recents, or Android recreating it), the intent that first opened the task is not followed again.
    val replayed = LaunchIntents.forgetReplayed(this, savedInstanceState)
    super.onCreate(savedInstanceState)
    if (!replayed) IntakeModule.receive(this, intent)
  }

  /** singleTask: a share or a widget tap while the app is open arrives here. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    IntakeModule.receive(this, intent)
  }

  override fun getMainComponentName(): String = "Carnet"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
