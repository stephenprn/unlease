package com.stephenprn.carnet.organic

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Region
import android.graphics.drawable.Drawable
import android.os.Build
import android.view.View
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.max
import kotlin.math.min

/**
 * A surface in Carnet's shapes, which a React Native radius (one plain circle per corner) cannot
 * draw: a sheet with the continuous corner (`Squircle`, from `design/shapes.ts`), a dot
 * (radii in % of the box: plain ellipses), or the brand's pebble (`pebbles.ts`), which gives toward
 * round while `given` (pressed) and springs back. React Native still lays it out and paints its background
 * (a colour, a gradient, a ruled paper) through its own drawable, drawn here inside the shape; the
 * border and the outset shadows are drawn here in the shape; with overflow hidden, the children
 * are clipped to the inside of the border, as CSS does. Every other view prop behaves as on a View.
 */
class OrganicView(context: Context) : ReactViewGroup(context) {
  private val density = context.resources.displayMetrics.density

  /** Each corner, top-left first and clockwise: its horizontal then its vertical radius, in dp (or % of the box when [relative]). */
  private var radii = FloatArray(8)
  private var relative = false
  /** The pebble at rest and given (`pebbleNumbers`), drawn instead of the radii when set. */
  private var pebble: FloatArray? = null
  private var pebbleGiven: FloatArray? = null
  /** How far the pebble has given, 0 at rest to 1 pressed. */
  private var morph = 0f
  private var given = false
  private var giving: ValueAnimator? = null
  private var strokeColor = Color.TRANSPARENT
  /** `borderWidth`, then the left, right, top and bottom ones (NaN: unset, the shared width applies). */
  private val borderWidths = FloatArray(5) { Float.NaN }
  private var strokeWidth = 0f
  private var strokeStyle: String? = null
  private var shadows: List<OrganicShadow> = emptyList()
  private var clips = false

  /** React Native's background (a colour, a gradient, a pattern): drawn inside the shape, never by View. */
  private var backdrop: Drawable? = null

  private val outer = Path()
  private val edge = Path()
  private val inner = Path()
  private val clipOut = Path()
  private val shadowPaths = ArrayList<Path>()
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private var shaped = false

  init {
    setWillNotDraw(false)
    outlineProvider =
        object : ViewOutlineProvider() {
          override fun getOutline(view: View, outline: Outline) {
            shape()
            when {
              view.width == 0 || view.height == 0 -> outline.setEmpty()
              Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> outline.setPath(outer)
              else -> @Suppress("DEPRECATION") outline.setConvexPath(outer)
            }
          }
        }
  }

  fun setRadii(values: FloatArray) {
    if (values.contentEquals(radii)) return
    radii = values
    reshape()
  }

  fun setRelative(value: Boolean) {
    if (value == relative) return
    relative = value
    reshape()
  }

  fun setPebble(values: FloatArray?) {
    val next = values?.takeIf { it.size >= 8 }
    if (next == null && pebble == null) return
    if (next != null && pebble?.contentEquals(next) == true) return
    pebble = next
    reshape()
  }

  fun setPebbleGiven(values: FloatArray?) {
    val next = values?.takeIf { it.size >= 8 }
    if (next != null && pebbleGiven?.contentEquals(next) == true) return
    pebbleGiven = next
    reshape()
  }

  /** Given (pressed), the pebble gives toward round at once; let go, it springs back (Material 3's fast spatial spring). The system's animation scale applies. */
  fun setGiven(value: Boolean) {
    if (value == given) return
    given = value
    if (pebble == null || pebbleGiven == null) return
    giving?.cancel()
    giving =
        ValueAnimator.ofFloat(morph, if (value) 1f else 0f).apply {
          duration = if (value) 90L else 380L
          interpolator = if (value) DecelerateInterpolator() else PathInterpolator(0.42f, 1.67f, 0.21f, 0.9f)
          addUpdateListener {
            morph = it.animatedValue as Float
            reshape()
          }
          start()
        }
  }

  override fun onDetachedFromWindow() {
    giving?.cancel()
    giving = null
    super.onDetachedFromWindow()
  }

  fun setStrokeColor(color: Int) {
    if (color == strokeColor) return
    strokeColor = color
    invalidate()
  }

  /** [index] follows React Native's `borderWidth` group: all, left, right, top, bottom (start and end are not drawn). */
  fun setEdgeWidth(index: Int, width: Float) {
    if (index !in borderWidths.indices) return
    borderWidths[index] = width
    strokeWidth = (1..4).maxOf { side(it) }
    reshape()
  }

  private fun side(index: Int): Float {
    val own = borderWidths[index]
    val shared = borderWidths[0]
    return if (!own.isNaN()) own else if (!shared.isNaN()) shared else 0f
  }

  fun setStrokeStyle(style: String?) {
    strokeStyle = style
    invalidate()
  }

  fun setShadows(value: List<OrganicShadow>) {
    shadows = value
    reshape()
  }

  fun setClips(value: Boolean) {
    if (value == clips) return
    clips = value
    invalidate()
  }

  private fun reshape() {
    shaped = false
    invalidateOutline()
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    reshape()
  }

  /** The corners in px; where two would overflow a side, all shrink by the same factor (as CSS does). */
  private fun corners(w: Float, h: Float): FloatArray {
    val r = FloatArray(8) { i -> if (relative) radii[i] / 100f * (if (i % 2 == 0) w else h) else radii[i] * density }
    var factor = 1f
    fun fit(sum: Float, side: Float) {
      if (sum > side && sum > 0f) factor = min(factor, side / sum)
    }
    fit(r[0] + r[2], w) // top: top-left and top-right across
    fit(r[6] + r[4], w) // bottom
    fit(r[1] + r[7], h) // left: top-left and bottom-left down
    fit(r[3] + r[5], h) // right
    if (factor < 1f) for (i in r.indices) r[i] *= factor
    return r
  }

  /** The same corners `by` px further in: the curve of a line drawn inside the edge (CSS inner radii). */
  private fun shrink(r: FloatArray, by: Float) = FloatArray(8) { max(0f, r[it] - by) }

  /** The box `inset` px in on every side (out, when negative), in the view's shape, concentric. */
  private fun addShape(path: Path, w: Float, h: Float, r: FloatArray, inset: Float) {
    val left = inset
    val top = inset
    val right = w - inset
    val bottom = h - inset
    // In, each radius less by as much; out, each round one more (a square corner stays square).
    val radii = if (inset >= 0f) shrink(r, inset) else FloatArray(8) { if (r[it] > 0f) r[it] - inset else 0f }
    val rest = pebble
    when {
      rest != null -> Squircle.addPebble(path, left, top, right, bottom, rest, pebbleGiven, morph)
      relative -> path.addRoundRect(left, top, right, bottom, radii, Path.Direction.CW)
      else -> Squircle.addTo(path, left, top, right, bottom, floatArrayOf(radii[0], radii[2], radii[4], radii[6]), min(w, h), inset)
    }
  }

  private fun shape() {
    if (shaped) return
    shaped = true
    val w = width.toFloat()
    val h = height.toFloat()
    val stroke = strokeWidth * density
    val r = corners(w, h)
    outer.rewind()
    addShape(outer, w, h, r, 0f)
    edge.rewind()
    addShape(edge, w, h, r, stroke / 2)
    inner.rewind()
    addShape(inner, w, h, r, stroke)
    // A hair inside, so no seam shows between the shadow and an anti-aliased edge (React Native's own trick).
    clipOut.rewind()
    addShape(clipOut, w, h, r, 0.4f)
    shadowPaths.clear()
    for (shadow in shadows) {
      val spread = shadow.spread * density
      shadowPaths.add(
          Path().apply {
            addShape(this, w, h, r, -spread)
            offset(shadow.offsetX * density, shadow.offsetY * density)
          },
      )
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    shape()
    // Blurred masks draw on the GPU from Android 9, as React Native's own shadows; the first is painted on top.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      for (i in shadows.indices.reversed()) {
        val save = canvas.save()
        canvas.clipOutPath(clipOut)
        canvas.drawPath(shadowPaths[i], shadows[i].paint)
        canvas.restoreToCount(save)
      }
    }
    backdrop?.let { paper ->
      paper.setBounds(0, 0, width, height)
      val save = canvas.save()
      canvas.clipPath(outer)
      paper.draw(canvas)
      canvas.restoreToCount(save)
    }
    if (strokeWidth > 0f && Color.alpha(strokeColor) != 0) {
      val stroke = strokeWidth * density
      strokePaint.color = strokeColor
      strokePaint.strokeWidth = stroke
      strokePaint.pathEffect =
          when (strokeStyle) {
            "dashed" -> DashPathEffect(floatArrayOf(stroke * 3, stroke * 3), 0f)
            "dotted" -> DashPathEffect(floatArrayOf(stroke, stroke), 0f)
            else -> null
          }
      // A side without a border (a sheet's foot): its strip is left out of the line.
      val save = canvas.save()
      if (side(1) == 0f) canvas.leaveOut(0f, 0f, stroke, height.toFloat())
      if (side(2) == 0f) canvas.leaveOut(width - stroke, 0f, width.toFloat(), height.toFloat())
      if (side(3) == 0f) canvas.leaveOut(0f, 0f, width.toFloat(), stroke)
      if (side(4) == 0f) canvas.leaveOut(0f, height - stroke, width.toFloat(), height.toFloat())
      canvas.drawPath(edge, strokePaint)
      canvas.restoreToCount(save)
    }
  }

  override fun dispatchDraw(canvas: Canvas) {
    if (!clips) {
      super.dispatchDraw(canvas)
      return
    }
    shape()
    val save = canvas.save()
    canvas.clipPath(inner)
    super.dispatchDraw(canvas)
    canvas.restoreToCount(save)
  }

  private fun Canvas.leaveOut(left: Float, top: Float, right: Float, bottom: Float) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) clipOutRect(left, top, right, bottom)
    else @Suppress("DEPRECATION") clipRect(left, top, right, bottom, Region.Op.DIFFERENCE)
  }

  @Deprecated("Deprecated in Java")
  override fun setBackgroundDrawable(background: Drawable?) {
    if (background === backdrop) return
    backdrop?.callback = null
    backdrop = background
    background?.callback = this
    invalidate()
  }

  override fun getBackground(): Drawable? = backdrop

  override fun verifyDrawable(who: Drawable): Boolean = who === backdrop || super.verifyDrawable(who)
}
