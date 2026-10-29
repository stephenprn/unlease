package com.stephenprn.carnet.organic

import android.graphics.Path
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * The continuous corner, mirrored number for number from `squircleSegments` in
 * `design/shapes.ts` (its spec and its tests): Figma's corner at smoothing 0.6, a short
 * circular arc between two easing curves, so the bend grows from nothing where a side meets it. One
 * radius per corner; a box too short for the easing keeps it, pulled in.
 */
internal object Squircle {
  private const val SMOOTHING = 0.6f
  /** A corner never takes more than this share of the box's shorter side (`CORNER_CAP`): a one-line note stays a sheet. */
  private const val CORNER_CAP = 0.3f

  private class Measures(val radius: Float, val p: Float, val a: Float, val b: Float, val c: Float, val d: Float, val arc: Float, val sweep: Float)

  private fun rad(degrees: Float): Float = (degrees * PI / 180.0).toFloat()

  private fun measures(radius: Float, budget: Float): Measures {
    var p = (1 + SMOOTHING) * radius
    val arcDegrees = 90f * (1 - SMOOTHING)
    val arc = sin(rad(arcDegrees / 2)) * radius * sqrt(2f)
    val alpha = (90f - arcDegrees) / 2
    val reach = radius * tan(rad(alpha / 2))
    val beta = 45f * SMOOTHING
    val c = reach * cos(rad(beta))
    val d = c * tan(rad(beta))
    var b = (p - arc - c - d) / 3
    var a = 2 * b
    if (p > budget) {
      // Not enough room for the whole easing: it is kept, pulled in.
      val room = max(0f, budget - d - arc - c)
      val least = room / 6
      b = min(b, room - least)
      a = room - b
      p = budget
    }
    return Measures(radius, p, a, b, c, d, arc, rad(arcDegrees))
  }

  // Each corner's vertex is the box's; it arrives along `along` and leaves along `away` (y down), clockwise from the top-left.
  private val ALONG_X = floatArrayOf(0f, 1f, 0f, -1f)
  private val ALONG_Y = floatArrayOf(-1f, 0f, 1f, 0f)
  private val AWAY_X = floatArrayOf(1f, 0f, -1f, 0f)
  private val AWAY_Y = floatArrayOf(0f, 1f, 0f, -1f)

  /**
   * Adds the outline of the box `left`, `top`, `right`, `bottom` (px) with these corner radii (px,
   * top-left first and clockwise), already taken `inset` px in from the view's own box (`boxMin`
   * px across its shorter side), whose share caps them.
   */
  fun addTo(path: Path, left: Float, top: Float, right: Float, bottom: Float, radii: FloatArray, boxMin: Float, inset: Float) {
    val w = right - left
    val h = bottom - top
    if (w <= 0f || h <= 0f) return
    val budget = min(w, h) / 2
    val cap = CORNER_CAP * boxMin - inset
    val vertexX = floatArrayOf(left, right, right, left)
    val vertexY = floatArrayOf(top, top, bottom, bottom)
    val corners = Array(4) { i ->
      val radius = min(budget, max(0f, min(cap, radii[i])))
      if (radius > 0f) measures(radius, budget) else null
    }
    fun x(corner: Int, u: Float, v: Float) = vertexX[corner] + u * ALONG_X[corner] + v * AWAY_X[corner]
    fun y(corner: Int, u: Float, v: Float) = vertexY[corner] + u * ALONG_Y[corner] + v * AWAY_Y[corner]
    fun reach(corner: Int) = corners[corner]?.p ?: 0f
    fun cubic(corner: Int, u1: Float, v1: Float, u2: Float, v2: Float, u: Float, v: Float) =
        path.cubicTo(x(corner, u1, v1), y(corner, u1, v1), x(corner, u2, v2), y(corner, u2, v2), x(corner, u, v), y(corner, u, v))

    path.moveTo(x(0, 0f, reach(0)), y(0, 0f, reach(0)))
    for (k in 0 until 4) {
      val corner = (k + 1) % 4
      path.lineTo(x(corner, -reach(corner), 0f), y(corner, -reach(corner), 0f))
      val m = corners[corner] ?: continue
      val start = -m.p
      val e1u = start + m.a + m.b + m.c
      val e1v = m.d
      val e2u = e1u + m.arc
      val e2v = e1v + m.arc
      // The arc as one cubic, its handles along the tangents the easing curves leave and meet it with.
      val handle = (4f / 3f) * tan(m.sweep / 4) * m.radius
      val length = hypot(m.c, m.d).takeIf { it > 0f } ?: 1f
      cubic(corner, start + m.a, 0f, start + m.a + m.b, 0f, e1u, e1v)
      cubic(corner, e1u + m.c / length * handle, e1v + m.d / length * handle, e2u - m.d / length * handle, e2v - m.c / length * handle, e2u, e2v)
      cubic(corner, e2u + m.d, e2v + m.c, e2u + m.d, e2v + m.b + m.c, 0f, m.p)
    }
    path.close()
  }

  /**
   * Adds the brand's pebble (`pebbleNumbers` in `design/pebbles.ts`: a start and six numbers
   * per cubic piece, on a 100 grid) stretched to the box, `morph` of the way from `rest` to `given`.
   */
  fun addPebble(path: Path, left: Float, top: Float, right: Float, bottom: Float, rest: FloatArray, given: FloatArray?, morph: Float) {
    val sx = (right - left) / 100f
    val sy = (bottom - top) / 100f
    fun at(i: Int): Float {
      val from = rest[i]
      val to = given?.getOrNull(i) ?: from
      return from + (to - from) * morph
    }
    fun x(i: Int) = left + at(i) * sx
    fun y(i: Int) = top + at(i) * sy
    if (rest.size < 8) return
    path.moveTo(x(0), y(1))
    var i = 2
    while (i + 5 < rest.size) {
      path.cubicTo(x(i), y(i + 1), x(i + 2), y(i + 3), x(i + 4), y(i + 5))
      i += 6
    }
    path.close()
  }
}
