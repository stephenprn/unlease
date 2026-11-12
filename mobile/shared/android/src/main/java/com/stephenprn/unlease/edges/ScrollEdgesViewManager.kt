package com.stephenprn.unlease.edges

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/** `ScrollEdgesView`: a View around a vertical scroller whose top edge dissolves while it runs on past it ([ScrollEdgesView]). */
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

  companion object {
    const val NAME = "ScrollEdgesView"
  }
}
