package com.stephenprn.unlease.overlays

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import com.stephenprn.unlease.specs.NativeOverlaysSpec
import java.lang.ref.WeakReference

/**
 * Overlays that hold TalkBack. The suite's sheets, drawer, dialogs and menus are drawn in place over
 * the screen they open from (so they stay under the slip and inside the navigator), and Android knows
 * no modal view inside a window: TalkBack would walk on into the screen behind the scrim. While a
 * layer is open, every view beside it and beside each of its parents, up to the activity's content,
 * is set `IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS`; once it closes each gets back what it had.
 * Layers stack: the last one opened holds TalkBack, and closing it gives TalkBack back to the one
 * under it. What was hidden already is left alone, and so is the slip (`nativeID` [KEEP]).
 */
class OverlaysModule(reactContext: ReactApplicationContext) : NativeOverlaysSpec(reactContext) {
  private val main = Handler(Looper.getMainLooper())

  override fun hideOthers(tag: Double, key: String) {
    val id = tag.toInt()
    UiThreadUtil.runOnUiThread {
      wanted.add(key)
      open(key, id, 0)
    }
  }

  override fun release(key: String) {
    UiThreadUtil.runOnUiThread {
      wanted.remove(key)
      if (layers.remove(key) != null) apply()
    }
  }

  private fun open(key: String, id: Int, attempt: Int) {
    if (key !in wanted) return
    val view = try {
      UIManagerHelper.getUIManager(reactApplicationContext, UIManagerType.FABRIC)?.resolveView(id)
    } catch (_: Exception) {
      null
    }
    if (view == null || !view.isAttachedToWindow) {
      // The call can come before the view is mounted: a few frames more.
      if (attempt < ATTEMPTS) main.postDelayed({ open(key, id, attempt + 1) }, FRAME_MS)
      return
    }
    layers[key] = WeakReference(view)
    apply()
  }

  /** Gives back what was hidden, then hides what lies beside the layer on top. Main thread only. */
  private fun apply() {
    for ((reference, was) in hidden) {
      // Changed since by React (closed and opened again): its own value stands.
      reference.get()?.takeIf { it.importantForAccessibility == HIDE }?.importantForAccessibility = was
    }
    hidden.clear()
    val top = layers.values.reversed().firstNotNullOfOrNull { reference -> reference.get()?.takeIf { it.isAttachedToWindow } } ?: return
    var child: View = top
    while (true) {
      val parent = child.parent as? ViewGroup ?: break
      for (index in 0 until parent.childCount) {
        val sibling = parent.getChildAt(index)
        if (sibling === child || sibling.importantForAccessibility == HIDE || sibling.getTag(com.facebook.react.R.id.view_tag_native_id) == KEEP) continue
        hidden.add(WeakReference(sibling) to sibling.importantForAccessibility)
        sibling.importantForAccessibility = HIDE
      }
      if (parent.id == android.R.id.content) break
      child = parent
    }
  }

  private companion object {
    const val ATTEMPTS = 20
    const val FRAME_MS = 16L
    const val HIDE = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    /** `KEEP_REACHABLE` in `src/platform/overlays.ts`. */
    const val KEEP = "unlease-keep-reachable"
    /** The open layers, oldest first (main thread only). */
    val layers = LinkedHashMap<String, WeakReference<View>>()
    /** Layers asked for and not yet let go, while their view is still being mounted. */
    val wanted = HashSet<String>()
    /** What the layer on top hid, and what each had before. */
    val hidden = mutableListOf<Pair<WeakReference<View>, Int>>()
  }
}
