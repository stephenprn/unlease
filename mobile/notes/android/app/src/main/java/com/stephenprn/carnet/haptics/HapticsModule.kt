package com.stephenprn.carnet.haptics

import android.os.Build
import android.view.HapticFeedbackConstants
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.stephenprn.carnet.specs.NativeHapticsSpec

/** The system's own clicks on the window's view: they follow the owner's touch-feedback setting and need no permission. */
class HapticsModule(reactContext: ReactApplicationContext) : NativeHapticsSpec(reactContext) {
  override fun perform(kind: String) {
    val constant = when (kind) {
      "threshold" -> if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE else HapticFeedbackConstants.CONTEXT_CLICK
      "release" -> if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.GESTURE_THRESHOLD_DEACTIVATE else HapticFeedbackConstants.CLOCK_TICK
      "pick" -> HapticFeedbackConstants.LONG_PRESS
      "confirm" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
      else -> return
    }
    UiThreadUtil.runOnUiThread {
      reactApplicationContext.currentActivity?.window?.decorView?.performHapticFeedback(constant)
    }
  }
}
