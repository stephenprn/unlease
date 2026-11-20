package com.stephenprn.unlease.organic

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.Region
import android.os.Build
import android.util.LruCache
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * One `boxShadow` layer of a sheet, painted once and laid down as nine pieces: its corners as they
 * were painted, its sides stretched between them (along a side the shadow is the same from one end
 * to the other). Drawn as a blurred path it is cut out of the sheet with a clip, and a path's clip is
 * a mask the GPU makes again on every frame that moves it: a wall of cards scrolled at half its
 * frames. A piece is a picture: nothing is clipped or blurred as it scrolls, and sheets of one
 * kind share one (it holds the shadow's shape alone, tinted as it is drawn).
 *
 * A box too small for its corners to stand apart is painted whole, at its own size.
 */
internal class ShadowPatch private constructor(
    private val bitmap: Bitmap,
    /** How far the picture goes past the box, on every side. */
    private val extent: Int,
    /** The painted box, and each corner's share of it. */
    private val boxWidth: Int,
    private val boxHeight: Int,
    private val cornerX: Int,
    private val cornerY: Int,
) {
  private val from = Rect()
  private val to = Rect()

  /** Lays the shadow around a box `width` by `height` at the canvas's origin, in `paint`'s colour. */
  fun draw(canvas: Canvas, width: Int, height: Int, paint: Paint) {
    val fromX = intArrayOf(0, extent + cornerX, extent + boxWidth - cornerX, boxWidth + 2 * extent)
    val fromY = intArrayOf(0, extent + cornerY, extent + boxHeight - cornerY, boxHeight + 2 * extent)
    val toX = intArrayOf(-extent, cornerX, width - cornerX, width + extent)
    val toY = intArrayOf(-extent, cornerY, height - cornerY, height + extent)
    for (row in 0 until 3) {
      for (column in 0 until 3) {
        // Under the sheet nothing was painted: the shadow is cut out of it.
        if (row == 1 && column == 1) continue
        if (fromX[column + 1] <= fromX[column] || fromY[row + 1] <= fromY[row] || toX[column + 1] <= toX[column] || toY[row + 1] <= toY[row]) continue
        from.set(fromX[column], fromY[row], fromX[column + 1], fromY[row + 1])
        to.set(toX[column], toY[row], toX[column + 1], toY[row + 1])
        canvas.drawBitmap(bitmap, from, to, paint)
      }
    }
  }

  /** What tells one painted shadow from another: the box painted, its corners, and the layer. */
  private data class Key(val width: Int, val height: Int, val corners: List<Int>, val offsetX: Int, val offsetY: Int, val spread: Int, val blur: Int)

  companion object {
    /** The pictures kept, by weight: a handful of kinds of sheet, each a few hundred px a side at one byte a pixel. */
    private val kept =
        object : LruCache<Key, ShadowPatch>(4 * 1024 * 1024) {
          override fun sizeOf(key: Key, value: ShadowPatch): Int = value.bitmap.allocationByteCount
        }

    /** A blur of this radius, as Android's mask filter spreads it (Skia's sigma, three of them each way). */
    private fun reachOfBlur(radius: Float): Float = if (radius > 0f) 3f * (0.57735f * radius + 0.5f) else 0f

    private fun fine(value: Float): Int = (value * 4f).roundToInt()

    /**
     * The shadow `layer` (px) of a sheet `width` by `height` whose corners' arcs have these radii
     * (px, top-left first and clockwise, as drawn: `Squircle.radiusIn`), or null where it cannot be
     * pieces (no size). `addShape` adds the sheet's outline for a box of the size it is given, `inset` px in.
     */
    fun of(
        width: Int,
        height: Int,
        radii: FloatArray,
        offsetX: Float,
        offsetY: Float,
        spread: Float,
        blur: Float,
        addShape: (path: Path, width: Float, height: Float, inset: Float) -> Unit,
    ): ShadowPatch? {
      if (width <= 0 || height <= 0) return null
      val past = reachOfBlur(blur) + max(0f, spread) + max(abs(offsetX), abs(offsetY))
      val extent = ceil(past).toInt() + 2
      // A corner's share of a side: its own reach, then as far as the shadow of its bend carries.
      val zone = ceil(Squircle.reachOf(radii.max() + max(0f, spread)) + past + abs(min(0f, spread))).toInt() + 2
      val boxWidth = if (width >= 2 * zone + 2) 2 * zone + 2 else width
      val boxHeight = if (height >= 2 * zone + 2) 2 * zone + 2 else height
      val key = Key(boxWidth, boxHeight, radii.map(::fine), fine(offsetX), fine(offsetY), fine(spread), fine(blur))
      kept.get(key)?.let { return it }

      val bitmap = Bitmap.createBitmap(boxWidth + 2 * extent, boxHeight + 2 * extent, Bitmap.Config.ALPHA_8)
      val canvas = Canvas(bitmap)
      canvas.translate(extent.toFloat(), extent.toFloat())
      // A hair inside, so no seam shows between the shadow and an anti-aliased edge (React Native's own trick).
      val sheet = Path().also { addShape(it, boxWidth.toFloat(), boxHeight.toFloat(), 0.4f) }
      val cast = Path().also {
        addShape(it, boxWidth.toFloat(), boxHeight.toFloat(), -spread)
        it.offset(offsetX, offsetY)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) canvas.clipOutPath(sheet) else @Suppress("DEPRECATION") canvas.clipPath(sheet, Region.Op.DIFFERENCE)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        if (blur > 0f) maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
      }
      canvas.drawPath(cast, paint)
      val cornerX = if (boxWidth < width) zone else boxWidth / 2
      val cornerY = if (boxHeight < height) zone else boxHeight / 2
      return ShadowPatch(bitmap, extent, boxWidth, boxHeight, cornerX, cornerY).also { kept.put(key, it) }
    }
  }
}
