package com.stephenprn.carnet.widget

import android.animation.ValueAnimator
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.textclassifier.TextClassifier
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.carnet.R
import java.lang.ref.WeakReference

/**
 * The quick window: a sheet over the home screen, drawn by the app's JavaScript (`quickWindow`, see
 * `src/app/providers/QuickProviders.tsx`), without opening the board. It holds the link field and the
 * pickers a widget is pointed with, as it is placed (the launcher's configuration step) or later.
 * Its window is the scrim, so a tap on a widget answers before JavaScript has drawn anything.
 */
class QuickActivity : ReactActivity() {
  private var clip: String? = null
  private val waiting = mutableListOf<(String) -> Unit>()

  private val configuring: Boolean
    get() = intent?.action == AppWidgetManager.ACTION_APPWIDGET_CONFIGURE

  private val widgetId: Int
    get() = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID

  override fun getMainComponentName(): String = COMPONENT

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName) {
        override fun getLaunchOptions(): Bundle = launch()
      }

  /** What JavaScript opens on: the mode, the widget, what it shows now, and whether it is being placed. */
  private fun launch(): Bundle {
    val id = widgetId
    val mode = if (configuring) Widgets.kindOf(this, id) else intent?.getStringExtra(EXTRA_MODE)
    val target = intent?.getStringExtra(EXTRA_TARGET) ?: if (configuring) "" else WidgetStore(this).target(id)
    return Bundle().apply {
      putString("mode", mode ?: "link")
      putInt("widgetId", id)
      putString("target", target)
      putBoolean("configuring", configuring)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // A quick window brought back after the process died starts over; it is never restored.
    super.onCreate(null)
    current = WeakReference(this)
    if (configuring) {
      // Leaving without a choice cancels the placing: the launcher does not add the widget.
      setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
      if (Widgets.kindOf(this, widgetId) == null) finish()
    }
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  /** Android lets an app read the clipboard only once its window has focus: read once, for the link field. */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (!hasFocus || clip != null) return
    val mode = intent?.getStringExtra(EXTRA_MODE)
    val text = if (mode == "link" && !configuring) readClipboard() else ""
    clip = text
    waiting.forEach { it(text) }
    waiting.clear()
  }

  /** Read only when it may hold a link: reading shows Android's "pasted from your clipboard" note, describing it does not. */
  private fun readClipboard(): String =
      try {
        val clipboard = getSystemService(ClipboardManager::class.java)
        val description = clipboard?.primaryClipDescription
        if (description == null || !description.hasMimeType("text/*") || !mayHoldLink(description)) ""
        else clipboard.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString() ?: ""
      } catch (_: Exception) {
        ""
      }

  /** Android 12 and later classify what was copied: text it is sure holds no address is left alone. */
  private fun mayHoldLink(description: ClipDescription): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    if (description.classificationStatus != ClipDescription.CLASSIFICATION_COMPLETE) return true
    return description.getConfidenceScore(TextClassifier.TYPE_URL) > 0f
  }

  private fun answerClipboard(answer: (String) -> Unit) {
    clip?.let {
      answer(it)
      return
    }
    waiting.add(answer)
    // Focus that never comes (the screen locked meanwhile): the field opens empty.
    Handler(Looper.getMainLooper()).postDelayed(
        {
          if (waiting.remove(answer)) answer("")
        },
        CLIPBOARD_WAIT_MS,
    )
  }

  /** The scrim fades away, leaving the home screen under the slip that confirms what was saved. */
  fun clearScrim() {
    val drawable = ColorDrawable(getColor(R.color.wgen_scrim))
    window.setBackgroundDrawable(drawable)
    ValueAnimator.ofInt(drawable.alpha, 0).apply {
      duration = 200
      addUpdateListener { drawable.alpha = it.animatedValue as Int }
      start()
    }
  }

  fun close(done: Boolean) {
    if (done && configuring) setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    finish()
  }

  companion object {
    /** Registered in index.js under the same name. */
    const val COMPONENT = "quickWindow"
    const val EXTRA_MODE = "com.stephenprn.carnet.quick.MODE"
    const val EXTRA_TARGET = "com.stephenprn.carnet.quick.TARGET"
    private const val CLIPBOARD_WAIT_MS = 1_500L

    @Volatile private var current: WeakReference<QuickActivity>? = null

    /** The quick window, on the main thread, if it is up. */
    internal fun withCurrent(action: (QuickActivity) -> Unit) {
      Handler(Looper.getMainLooper()).post { current?.get()?.let(action) }
    }

    /** The clipboard as the quick window found it on focus; '' without a window. */
    internal fun clipboard(answer: (String) -> Unit) {
      Handler(Looper.getMainLooper()).post {
        val activity = current?.get()
        if (activity == null) answer("") else activity.answerClipboard(answer)
      }
    }
  }
}
