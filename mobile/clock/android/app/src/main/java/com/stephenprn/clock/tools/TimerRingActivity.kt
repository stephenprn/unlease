package com.stephenprn.clock.tools

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * A timer's window: JavaScript's `timerWindow` root (« Temps écoulé », the timer's name, how long ago
 * it ended, « Arrêter », « +1 min »), over the lock screen and turning the screen on, by the ringing
 * notification's full-screen intent. It closes once nothing rings any more, wherever that was
 * answered; the volume keys stop the ring. Its own task, never in Recents.
 */
class TimerRingActivity : ReactActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private val listener: (ToolsSnapshot) -> Unit = { if (!ringing()) closeSoon() }

  private fun ringing(): Boolean = ToolStore(this).runs().any { it.state == TimerRunRecord.RINGING && !it.silenced }

  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON)
    volumeControlStream = android.media.AudioManager.STREAM_ALARM
    super.onCreate(null)
    ToolEvents.add(listener)
    if (!ringing()) finish()
  }

  private fun closeSoon() {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ if (!isFinishing) finish() }, 400L)
  }

  /** A volume key stops what rings, as a kitchen timer's button does. */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val volumeKey = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || event.keyCode == KeyEvent.KEYCODE_VOLUME_MUTE
    if (volumeKey) {
      if (event.action == KeyEvent.ACTION_UP) TimerEngine.stopRinging(this)
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  override fun onDestroy() {
    ToolEvents.remove(listener)
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "timerWindow"

  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName)
}
