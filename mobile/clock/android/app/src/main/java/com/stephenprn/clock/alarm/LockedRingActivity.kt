package com.stephenprn.clock.alarm

import android.app.Activity
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import com.stephenprn.unlease.organic.Squircle
import java.util.Date
import kotlin.math.min

/**
 * The ringing window before the phone is first unlocked after a restart (Direct Boot: the night an
 * update restarts it). React Native waits for the unlock (the app's own storage is sealed until then),
 * so this one is drawn here: the time, the alarm's name, « Répéter » and « Arrêter », over the lock
 * screen, turning the screen on. The person's colours are sealed too: the ring's night ground and
 * the cream of the marks, which every palette shares; the buttons take the house's continuous corner
 * at the button's radius (`SHAPES.button`, `Squircle`), never a pill. It takes the volume keys as the settings say,
 * and closes once the alarm is snoozed or stopped, wherever that was done. Direct Boot aware, its own
 * task, never in Recents, not exported.
 */
class LockedRingActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val listener: (RingSnapshot) -> Unit = { snapshot -> if (snapshot.state != "ringing") handler.postDelayed({ if (!isFinishing) finish() }, 600L) }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    volumeControlStream = android.media.AudioManager.STREAM_ALARM
    val store = AlarmStore(this)
    val record = store.ring()
    if (record == null) {
      finish()
      return
    }
    setContentView(layout(record, store.plan().settings))
    RingEvents.add(listener)
  }

  private fun dp(value: Float): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics).toInt()

  private fun font(name: String): Typeface = try {
    Typeface.createFromAsset(assets, "fonts/$name.ttf")
  } catch (_: Exception) {
    Typeface.DEFAULT
  }

  private fun text(value: String, sizeSp: Float, face: String, color: Int): TextView =
      TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        typeface = font(face)
        setTextColor(color)
        gravity = Gravity.CENTER
        fontFeatureSettings = "tnum"
      }

  /** A full-width button, its fill in the continuous corner. */
  private fun button(label: String, fill: Int, ink: Int, height: Float, onPress: () -> Unit): TextView =
      text(label, 20f, "SignikaNight-SemiBold", ink).apply {
        background = ControlShape(fill, dp(CONTROL_RADIUS).toFloat())
        isClickable = true
        isFocusable = true
        contentDescription = label
        setOnClickListener { onPress() }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(height)).apply { topMargin = dp(12f) }
      }

  private fun layout(record: RingRecord, settings: RingSettings): View {
    val words = settings.words
    val now = Date()
    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(GROUND)
      setPadding(dp(24f), dp(96f), dp(24f), dp(48f))
      addView(text(DateFormat.getLongDateFormat(this@LockedRingActivity).format(now), 15f, "SignikaNight-Regular", MUTED))
      addView(text(DateFormat.getTimeFormat(this@LockedRingActivity).format(now), 88f, "SignikaNight-SemiBold", CREAM))
      addView(text(record.alarm.title, 22f, "SignikaNight-Medium", CREAM).apply { maxLines = 2 })
      addView(View(this@LockedRingActivity), LinearLayout.LayoutParams(0, 0, 1f))
      addView(button("${words.snooze} · ${settings.snoozeMinutes} min", RAISED, CREAM, 64f) { RingService.send(this@LockedRingActivity, RingService.ACTION_SNOOZE) })
      addView(button(words.stop, CREAM, GROUND, 72f) { RingService.send(this@LockedRingActivity, RingService.ACTION_STOP) })
    }
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

  /** Back leaves the alarm ringing, its notification there: the window stays until it is answered. */
  @Deprecated("Back answers nothing here")
  override fun onBackPressed() {}

  override fun onDestroy() {
    RingEvents.remove(listener)
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  /** A control's fill in the continuous corner (`Squircle`, the phone's own `OrganicView` shape), dimmed while pressed. */
  private class ControlShape(fill: Int, private val radius: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = fill }
    private val path = Path()

    override fun onBoundsChange(bounds: Rect) {
      path.reset()
      Squircle.addTo(path, bounds.left.toFloat(), bounds.top.toFloat(), bounds.right.toFloat(), bounds.bottom.toFloat(), FloatArray(4) { radius }, min(bounds.width(), bounds.height()).toFloat(), 0f)
    }

    override fun draw(canvas: Canvas) {
      canvas.drawPath(path, paint)
    }

    override fun isStateful(): Boolean = true

    override fun onStateChange(state: IntArray): Boolean {
      val alpha = if (state.contains(android.R.attr.state_pressed)) 200 else 255
      if (paint.alpha == alpha) return false
      paint.alpha = alpha
      invalidateSelf()
      return true
    }

    override fun setAlpha(alpha: Int) {
      paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
      paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }

  private companion object {
    /** `RADII.control`: a button's corner (`design/shapes.ts`). */
    const val CONTROL_RADIUS = 13f
    /** `@color/ring_ground`, the ringing window's own night. */
    val GROUND = Color.parseColor("#1A1817")
    /** The marks' cream (`MARK_COLORS.card`), every palette's. */
    val CREAM = Color.parseColor("#F2EAD5")
    val MUTED = Color.parseColor("#B5AC9C")
    val RAISED = Color.parseColor("#2E2A27")
  }
}
