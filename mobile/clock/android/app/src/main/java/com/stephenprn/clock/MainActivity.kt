package com.stephenprn.clock

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.AlarmClock
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.clock.intake.IntakeModule
import com.stephenprn.unlease.launch.LaunchIntents

class MainActivity : ReactActivity() {

  /**
   * Parks another app's « set an alarm » for JavaScript. Only on a real launch (null
   * `savedInstanceState`): a recreation (rotation, theme change) must not deliver it twice.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    // Brought back (Recents, or Android recreating it), the intent that first opened the task is not followed again.
    val replayed = LaunchIntents.forgetReplayed(this, savedInstanceState)
    super.onCreate(savedInstanceState)
    if (!replayed) IntakeModule.receive(this, intent)
  }

  /** singleTask: a link (`unlease-clock://alarm/<id>`), the status bar's alarm or « set an alarm » while the app is open arrives here. */
  override fun onNewIntent(intent: Intent) {
    // « Show alarms » (another app, the status bar's alarm) while the app is open on another screen:
    // handed to React Navigation as the home's link, so the alarms come back.
    val followed = if (intent.action == AlarmClock.ACTION_SHOW_ALARMS) alarmsLink() else intent
    super.onNewIntent(followed)
    setIntent(followed)
    IntakeModule.receive(this, followed)
  }

  override fun onResume() {
    super.onResume()
    inFront = true
  }

  override fun onPause() {
    inFront = false
    super.onPause()
  }

  /** The root `index.js` registers (`app.json`). */
  override fun getMainComponentName(): String = "Clock"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  companion object {
    /** The home's link (`unlease-clock://`), which React Navigation opens on the alarms. */
    fun alarmsLink(): Intent = Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://"))

    /** Whether the app is open in front: an alarm ringing then opens its window itself (RingService). */
    @Volatile
    var inFront = false
  }
}
