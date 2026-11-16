package com.stephenprn.clock.intake

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.stephenprn.unlease.specs.NativeIntakeSpec
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject

/** As JavaScript receives it: what another app handed, in `text`, its `mimeType` saying what ([IntakeModule.SET_ALARM]). */
data class Share(val id: String, val mimeType: String, val text: String)

/**
 * Clock's side of the Intake spec (`mobile/shared/specs/NativeIntake.ts`): another app's « set an
 * alarm » (`AlarmClock.ACTION_SET_ALARM`: the assistant, a calendar's « wake me before », a sleep app),
 * its hour, minutes, days (`Calendar.SUNDAY` 1 … `SATURDAY` 7), message and vibration as JSON, parked
 * in [pending] until JavaScript takes it and opens the new alarm's form filled in (`app/intake.ts`);
 * nothing is kept until the person saves it, even when the other app asks to skip the form.
 */
class IntakeModule(private val reactContext: ReactApplicationContext) : NativeIntakeSpec(reactContext) {

  init {
    live = WeakReference(this)
  }

  override fun invalidate() {
    if (live?.get() === this) live = null
    super.invalidate()
  }

  override fun takePendingShare(promise: Promise) {
    promise.resolve(toMap(pending.getAndSet(null)))
  }

  override fun setKeepScreenOn(on: Boolean) {
    UiThreadUtil.runOnUiThread {
      val window = reactContext.currentActivity?.window ?: return@runOnUiThread
      if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  private fun deliver(share: Share) {
    emitOnShare(toMap(share))
  }

  companion object {
    /** Another app's « set an alarm »: `{ hour, minutes, days, message, vibrate, skipUi }`, each only when handed. */
    const val SET_ALARM = "x-unlease/alarm-set"

    private val pending = AtomicReference<Share?>(null)
    @Volatile private var live: WeakReference<IntakeModule>? = null

    fun receive(@Suppress("UNUSED_PARAMETER") context: Context, intent: Intent?) {
      if (intent?.action != AlarmClock.ACTION_SET_ALARM) return
      val json = JSONObject()
      if (intent.hasExtra(AlarmClock.EXTRA_HOUR)) json.put("hour", intent.getIntExtra(AlarmClock.EXTRA_HOUR, -1))
      if (intent.hasExtra(AlarmClock.EXTRA_MINUTES)) json.put("minutes", intent.getIntExtra(AlarmClock.EXTRA_MINUTES, -1))
      intent.getIntegerArrayListExtra(AlarmClock.EXTRA_DAYS)?.let { days -> json.put("days", JSONArray(days.filter { it in 1..7 }.map { it - 1 })) }
      intent.getStringExtra(AlarmClock.EXTRA_MESSAGE)?.let { json.put("message", it.take(80)) }
      if (intent.hasExtra(AlarmClock.EXTRA_VIBRATE)) json.put("vibrate", intent.getBooleanExtra(AlarmClock.EXTRA_VIBRATE, true))
      // An assistant's « set an alarm for 7 » asks for no form: set at once when it named the hour.
      if (intent.getBooleanExtra(AlarmClock.EXTRA_SKIP_UI, false)) json.put("skipUi", true)
      park(Share(UUID.randomUUID().toString(), SET_ALARM, json.toString()))
    }

    /** Kept until JavaScript takes it (after the first run, if the app is not set up yet), and sent at once to a live module. */
    private fun park(share: Share) {
      pending.set(share)
      live?.get()?.deliver(share)
    }

    private fun toMap(share: Share?): WritableMap =
        Arguments.createMap().apply {
          putString("id", share?.id ?: "")
          putString("text", share?.text ?: "")
          putString("subject", "")
          putString("mimeType", share?.mimeType ?: "")
          putArray("files", Arguments.createArray())
        }
  }
}
