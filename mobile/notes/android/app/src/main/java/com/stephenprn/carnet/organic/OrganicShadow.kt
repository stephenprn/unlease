package com.stephenprn.carnet.organic

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Color
import android.graphics.Paint
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.style.BoxShadow

/** One outset `boxShadow` layer, ready to draw: its offset and spread in dp, its blurred paint. */
class OrganicShadow(val offsetX: Float, val offsetY: Float, val spread: Float, val paint: Paint) {
  companion object {
    /** CSS blurs with a standard deviation of half the blur radius; Android takes a radius (React Native's own conversion). */
    private fun blurRadius(blur: Float, density: Float): Float {
      val sigma = blur * 0.5f * density
      return if (sigma > 0.5f) (sigma - 0.5f) / 0.57735f else 0f
    }

    /** React Native's parsed `boxShadow` list; inset shadows are not drawn. */
    fun parse(shadows: ReadableArray?, context: Context): List<OrganicShadow> {
      if (shadows == null) return emptyList()
      val density = context.resources.displayMetrics.density
      val layers = ArrayList<OrganicShadow>()
      for (i in 0 until shadows.size()) {
        val shadow = BoxShadow.parse(shadows.getMap(i), context) ?: continue
        if (shadow.inset == true) continue
        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
              color = shadow.color ?: Color.BLACK
              val radius = blurRadius(shadow.blurRadius ?: 0f, density)
              if (radius > 0f) maskFilter = BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
            }
        layers.add(OrganicShadow(shadow.offsetX, shadow.offsetY, shadow.spreadDistance ?: 0f, paint))
      }
      return layers
    }
  }
}
