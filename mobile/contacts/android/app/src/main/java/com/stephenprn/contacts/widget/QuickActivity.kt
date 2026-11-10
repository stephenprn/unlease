package com.stephenprn.contacts.widget

import android.animation.ValueAnimator
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.stephenprn.contacts.R
import java.lang.ref.WeakReference

/**
 * The quick window: a sheet over the home screen, drawn by the app's JavaScript (`quickWindow`, see
 * `src/app/providers/QuickProviders.tsx`), without opening the list. It points « Appels rapides » at
 * the favourites or a label, as it is placed (the launcher's configuration step) or later. Its window
 * is the scrim, so a tap on a widget answers before JavaScript has drawn anything.
 */
class QuickActivity : ReactActivity() {
  private val configuring: Boolean
    get() = intent?.action == AppWidgetManager.ACTION_APPWIDGET_CONFIGURE

  private val widgetId: Int
    get() = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID

  override fun getMainComponentName(): String = COMPONENT

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName) {
        override fun getLaunchOptions(): Bundle = launch()
      }

  /** What JavaScript opens on: the widget, what it shows now, and whether it is being placed. */
  private fun launch(): Bundle =
      Bundle().apply {
        val id = widgetId
        putInt("widgetId", id)
        putString("target", if (configuring) "" else WidgetStore(this@QuickActivity).target(id))
        putBoolean("configuring", configuring)
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

  /** The scrim fades away, leaving the home screen. */
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

    @Volatile private var current: WeakReference<QuickActivity>? = null

    /** The quick window, on the main thread, if it is up. */
    internal fun withCurrent(action: (QuickActivity) -> Unit) {
      Handler(Looper.getMainLooper()).post { current?.get()?.let(action) }
    }
  }
}
