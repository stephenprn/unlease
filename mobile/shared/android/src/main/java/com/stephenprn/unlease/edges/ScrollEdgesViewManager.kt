package com.stephenprn.unlease.edges

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * `ScrollEdgesView`: a View around a scroller that tells a head when content goes under its top, and
 * fades the ends of a bounded box (a capped list, a strip that scrolls sideways) while it runs on past them ([ScrollEdgesView]).
 */
class ScrollEdgesViewManager : ReactViewManager() {
  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = ScrollEdgesView(context)

  @ReactProp(name = "length", defaultFloat = 24f)
  fun setLength(view: ReactViewGroup, length: Float) {
    (view as ScrollEdgesView).setLength(length)
  }

  @ReactProp(name = "top", defaultBoolean = true)
  fun setTop(view: ReactViewGroup, top: Boolean) {
    (view as ScrollEdgesView).setTopEdge(top)
  }

  @ReactProp(name = "insetTop", defaultFloat = 0f)
  fun setInsetTop(view: ReactViewGroup, inset: Float) {
    (view as ScrollEdgesView).setInsetTop(inset)
  }

  @ReactProp(name = "horizontal", defaultBoolean = false)
  fun setHorizontal(view: ReactViewGroup, horizontal: Boolean) {
    (view as ScrollEdgesView).setHorizontal(horizontal)
  }

  @ReactProp(name = "fadeStart", defaultBoolean = false)
  fun setFadeStart(view: ReactViewGroup, on: Boolean) {
    (view as ScrollEdgesView).setFadeStart(on)
  }

  @ReactProp(name = "fadeEnd", defaultBoolean = false)
  fun setFadeEnd(view: ReactViewGroup, on: Boolean) {
    (view as ScrollEdgesView).setFadeEnd(on)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    val constants: MutableMap<String, Any> = super.getExportedCustomDirectEventTypeConstants()?.toMutableMap() ?: HashMap()
    constants[UnderEvent.EVENT_NAME] = mapOf("registrationName" to "onUnder")
    return constants
  }

  companion object {
    const val NAME = "ScrollEdgesView"
  }
}
