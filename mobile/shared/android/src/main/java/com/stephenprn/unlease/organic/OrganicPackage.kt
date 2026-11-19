package com.stephenprn.unlease.organic

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.stephenprn.unlease.edges.CutFadeViewManager
import com.stephenprn.unlease.edges.ScrollEdgesViewManager

/** The shared views' managers: the organic view, the scroll edges that soften a scroller's ends, and the fade at a cut box's foot. */
class OrganicPackage : ReactPackage {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = listOf(OrganicViewManager(), ScrollEdgesViewManager(), CutFadeViewManager())
}
