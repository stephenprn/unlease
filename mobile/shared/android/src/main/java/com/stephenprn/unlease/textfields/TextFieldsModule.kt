package com.stephenprn.unlease.textfields

import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.EditText
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import com.stephenprn.unlease.specs.NativeTextFieldsSpec
import java.util.WeakHashMap

/**
 * Fields that grow with their words keep them still. React Native's Android input brings the caret
 * into view the moment a line is added (it never waits for a layout), while Fabric makes the field a
 * line taller only in the next frame: for that frame the input scrolls, the first line jumps out of
 * sight and back. A field held here never scrolls its words; the new line shows as the field grows.
 * A field with a cap is let go once its words reach it, and then scrolls them as any input does.
 */
class TextFieldsModule(reactContext: ReactApplicationContext) : NativeTextFieldsSpec(reactContext) {
  private val main = Handler(Looper.getMainLooper())

  override fun holdScroll(tag: Double, hold: Boolean) {
    val id = tag.toInt()
    UiThreadUtil.runOnUiThread { attach(id, hold, 0) }
  }

  private fun attach(id: Int, hold: Boolean, attempt: Int) {
    val view = try {
      UIManagerHelper.getUIManager(reactApplicationContext, UIManagerType.FABRIC)?.resolveView(id)
    } catch (_: Exception) {
      null
    }
    if (view !is EditText) {
      // The call can come before the view is mounted: a few frames more.
      if (attempt < ATTEMPTS) main.postDelayed({ attach(id, hold, attempt + 1) }, FRAME_MS)
      return
    }
    val was = held[view]
    held[view] = hold
    if (was == null) view.setOnScrollChangeListener(STILL)
    if (hold && view.scrollY != 0) view.scrollTo(view.scrollX, 0)
    // Let go at its cap: the caret it kept from sight comes into view.
    if (!hold && was == true && view.hasFocus()) view.bringPointIntoView(view.selectionEnd.coerceAtLeast(0))
  }

  private companion object {
    const val ATTEMPTS = 20
    const val FRAME_MS = 16L
    /** Whether each input is held (main thread only; an input gone is forgotten). */
    val held = WeakHashMap<View, Boolean>()
    val STILL = View.OnScrollChangeListener { view, scrollX, scrollY, _, _ ->
      if (scrollY != 0 && held[view] == true) view.scrollTo(scrollX, 0)
    }
  }
}
