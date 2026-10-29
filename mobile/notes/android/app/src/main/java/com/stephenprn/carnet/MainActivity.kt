package com.stephenprn.carnet

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.carnet.intake.IntakeModule

class MainActivity : ReactActivity() {

  /**
   * Parks a launch share for JavaScript. Only on a real launch (null `savedInstanceState`):
   * a recreation (rotation, theme change) must not deliver the same share twice.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState == null) IntakeModule.receive(this, intent)
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
