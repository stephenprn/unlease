package com.stephenprn.unlease.edges

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/** `CutFadeView`: a box whose content is cut at its foot, its last stretch dissolving ([CutFadeView]). */
class CutFadeViewManager : ReactViewManager() {
  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = CutFadeView(context)

  @ReactProp(name = "length", defaultFloat = 24f)
  fun setLength(view: ReactViewGroup, length: Float) {
    (view as CutFadeView).setLength(length)
  }

  companion object {
    const val NAME = "CutFadeView"
  }
}
