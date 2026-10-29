package com.stephenprn.carnet.organic

import android.graphics.Color
import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * `OrganicView`: a View in [OrganicView]'s shapes (continuous corners, dots, the pebble). Every View
 * prop keeps its meaning; the border, the radii and `boxShadow` are drawn by the view in its shape
 * instead of by React Native's background (one border colour; a side may go without).
 */
class OrganicViewManager : ReactViewManager() {
  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = OrganicView(context)

  @ReactProp(name = "radii")
  fun setRadii(view: ReactViewGroup, radii: ReadableArray?) {
    val values = FloatArray(8) { i -> if (radii != null && i < radii.size()) radii.getDouble(i).toFloat() else 0f }
    (view as OrganicView).setRadii(values)
  }

  @ReactProp(name = "relative", defaultBoolean = false)
  fun setRelative(view: ReactViewGroup, relative: Boolean) {
    (view as OrganicView).setRelative(relative)
  }

  @ReactProp(name = "pebble")
  fun setPebble(view: ReactViewGroup, pebble: ReadableArray?) {
    (view as OrganicView).setPebble(floats(pebble))
  }

  @ReactProp(name = "pebbleGiven")
  fun setPebbleGiven(view: ReactViewGroup, given: ReadableArray?) {
    (view as OrganicView).setPebbleGiven(floats(given))
  }

  @ReactProp(name = "given", defaultBoolean = false)
  fun setGiven(view: ReactViewGroup, given: Boolean) {
    (view as OrganicView).setGiven(given)
  }

  private fun floats(array: ReadableArray?): FloatArray? = array?.let { values -> FloatArray(values.size()) { values.getDouble(it).toFloat() } }?.takeIf { it.isNotEmpty() }

  // The shape comes from `radii`: a React Native radius is one circle.
  override fun setBorderRadius(view: ReactViewGroup, index: Int, rawBorderRadius: Dynamic) = Unit

  override fun setBorderWidth(view: ReactViewGroup, index: Int, width: Float) {
    (view as OrganicView).setEdgeWidth(index, width)
  }

  override fun setBorderColor(view: ReactViewGroup, index: Int, color: Int?) {
    if (index == 0) (view as OrganicView).setStrokeColor(color ?: Color.TRANSPARENT)
  }

  override fun setBorderStyle(view: ReactViewGroup, borderStyle: String?) {
    (view as OrganicView).setStrokeStyle(borderStyle)
  }

  override fun setBoxShadow(view: ReactViewGroup, shadows: ReadableArray?) {
    (view as OrganicView).setShadows(OrganicShadow.parse(shadows, view.context))
  }

  override fun setOverflow(view: ReactViewGroup, overflow: String?) {
    super.setOverflow(view, overflow)
    (view as OrganicView).setClips(overflow == "hidden" || overflow == "scroll")
  }

  companion object {
    const val NAME = "OrganicView"
  }
}
