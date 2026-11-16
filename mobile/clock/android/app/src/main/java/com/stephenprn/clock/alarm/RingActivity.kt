package com.stephenprn.clock.alarm

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.util.concurrent.CopyOnWriteArraySet

/** What rings now, as the app and the ringing window read it (`RingState` in the spec). */
internal data class RingSnapshot(val state: String, val record: RingRecord?, val until: Long) {
  companion object {
    val NONE = RingSnapshot("none", null, 0L)

    fun read(context: Context): RingSnapshot {
      val store = AlarmStore(context)
      store.ring()?.let { return RingSnapshot("ringing", it, 0L) }
      store.snoozes().maxByOrNull { it.until }?.let { return RingSnapshot("snoozed", it.record, it.until) }
      return NONE
    }
  }
}

/** Who wants to know when a ring begins, is snoozed or stops (the module, for JavaScript; the ringing window). */
internal object RingEvents {
  private val listeners = CopyOnWriteArraySet<(RingSnapshot) -> Unit>()
  private val main = Handler(Looper.getMainLooper())

  fun add(listener: (RingSnapshot) -> Unit) {
    listeners.add(listener)
  }

  fun remove(listener: (RingSnapshot) -> Unit) {
    listeners.remove(listener)
  }

  fun changed(context: Context) {
    if (listeners.isEmpty()) return
    val snapshot = RingSnapshot.read(context.applicationContext)
    main.post { for (listener in listeners) listener(snapshot) }
  }
}

/**
 * The ringing window: JavaScript's `ringWindow` root (the time, the alarm, the weather, the day's
 * events, « Répéter » and « Arrêter »), shown over the lock screen and turning the screen on, by the
 * ringing notification's full-screen intent. It keeps the screen on while it shows, takes the volume
 * keys as the settings say (snooze or stop), and closes once the alarm is snoozed or stopped, wherever
 * that was done. Its own task, never in Recents. Not Direct Boot aware: before the first unlock after
 * a restart, the notification's own buttons answer the alarm.
 */
class RingActivity : ReactActivity() {
  private val handler = Handler(Looper.getMainLooper())
  private val listener: (RingSnapshot) -> Unit = { snapshot -> if (snapshot.state != "ringing") closeSoon() }

  override fun onCreate(savedInstanceState: Bundle?) {
    showOverLockScreen()
    // The volume keys, when they set the volume, set the alarm's.
    volumeControlStream = android.media.AudioManager.STREAM_ALARM
    // React Native restores nothing across recreations: its root is drawn again from JavaScript.
    super.onCreate(null)
    RingEvents.add(listener)
    // Opened when nothing rings any more (an old notification): nothing to show.
    if (RingSnapshot.read(this).state != "ringing") finish()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON)
  }

  /** Long enough for « Répétée jusqu'à 7:40 » to be read, short enough not to linger. */
  private fun closeSoon() {
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ if (!isFinishing) finish() }, 1200L)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val volumeKey = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || event.keyCode == KeyEvent.KEYCODE_VOLUME_MUTE
    if (volumeKey) {
      when (AlarmStore(this).plan().settings.volumeKeys) {
        "snooze" -> {
          if (event.action == KeyEvent.ACTION_UP) RingService.send(this, RingService.ACTION_SNOOZE)
          return true
        }
        "stop" -> {
          if (event.action == KeyEvent.ACTION_UP) RingService.send(this, RingService.ACTION_STOP)
          return true
        }
      }
    }
    return super.dispatchKeyEvent(event)
  }

  override fun onDestroy() {
    RingEvents.remove(listener)
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "ringWindow"

  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName)
}
