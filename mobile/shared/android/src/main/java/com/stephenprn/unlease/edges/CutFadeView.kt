package com.stephenprn.unlease.edges

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min

/**
 * A box whose content is cut at its foot (`CutFade`): a card's text that goes on, a drawing taller
 * than its card. Its last [length] dissolves, from all of it to none at the edge, on the eased curve
 * of [ScrollEdgesView]'s ends (a cosine ease-in-out: a straight ramp shows where it starts and ends),
 * through a mask, so the paper, wash and grain under it stay as they are.
 *
 * Above the strip its children are drawn as they are; the strip alone goes through a layer, the
 * children drawn into it again (their display lists, recorded once) and masked.
 */
class CutFadeView(context: Context) : ReactViewGroup(context) {
  private val density = context.resources.displayMetrics.density
  private var length = 24f * density

  /** What shows of the content across the strip, from its inner end (all of it) to the edge (none). */
  private val colors = IntArray(EASE_STEPS) { i -> Color.argb((255f * (0.5f + 0.5f * cos(PI.toFloat() * i / (EASE_STEPS - 1)))).toInt(), 0, 0, 0) }
  private val positions = FloatArray(EASE_STEPS) { i -> i / (EASE_STEPS - 1f) }
  private val mask = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
  /** The mask's shader, kept while the strip stays where it is. */
  private var shaderTop = Float.NaN
  private var shaderBottom = Float.NaN

  fun setLength(dp: Float) {
    length = max(0f, dp) * density
    invalidate()
  }

  override fun dispatchDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    val span = min(length, h)
    if (span < 1f || w <= 0f) {
      super.dispatchDraw(canvas)
      return
    }
    val top = h - span

    canvas.save()
    canvas.clipRect(0f, 0f, w, top)
    super.dispatchDraw(canvas)
    canvas.restore()

    val layer = canvas.saveLayer(0f, top, w, h, null)
    canvas.clipRect(0f, top, w, h)
    super.dispatchDraw(canvas)
    if (shaderTop != top || shaderBottom != h) {
      mask.shader = LinearGradient(0f, top, 0f, h, colors, positions, Shader.TileMode.CLAMP)
      shaderTop = top
      shaderBottom = h
    }
    canvas.drawRect(0f, top, w, h, mask)
    canvas.restoreToCount(layer)
  }

  companion object {
    /** How many samples of the eased curve the mask holds: enough that no step shows (the scrollers' too). */
    private const val EASE_STEPS = 9
  }
}
