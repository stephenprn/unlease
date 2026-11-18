package com.stephenprn.clock.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.res.ResourcesCompat
import com.stephenprn.clock.R
import kotlin.math.ceil

/**
 * Signika for the widget's time and titles (as Agenda's `WidgetType.kt`). A launcher loads a widget's layout in a restricted context that
 * cannot read an app's fonts, so a title is set here, in the app, on an image the widget shows:
 * an alpha mask the image view tints with a colour resource, so it follows day and night. Each title
 * sits on a pair: the image, and a plain text view in the system font kept for when it cannot be
 * drawn (and for the launcher's previews, which draw the layout as it is).
 */
internal object WidgetType {
  enum class Face(val font: Int, val sizeSp: Float, val lineSp: Float, val trackingEm: Float = 0f, val features: String = "") {
    /** A widget's title in Signika (DESIGN.md: title in label size, 600): no alarm, an event's title. */
    TITLE(R.font.signika_semibold, 16f, 22f),
    /**
     * The next alarm's time, the widget's one figure: Signika SemiBold at 44/48 (the home's 56, a step
     * down for a launcher's cell), tightened as the display sizes are, in tabular figures as every time.
     */
    TIME(R.font.signika_semibold, 44f, 48f, -0.5f / 30f, "tnum"),
  }

  /** What a widget's titles may span when its width is not known yet (just placed). */
  private const val FALLBACK_WIDTH_DP = 250f

  /** The widget's width as the launcher shows it upright, in dp. */
  fun widthDp(manager: AppWidgetManager, id: Int): Float {
    val width = manager.getAppWidgetOptions(id)?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0
    return if (width > 0) width.toFloat() else FALLBACK_WIDTH_DP
  }

  /**
   * Sets `text` in `face` on `imageId`, at most `widthDp` wide and `maxLines` deep, ellipsized, tinted
   * `color`; `textId` (its plain twin) shows instead if it cannot be drawn. True when the image shows.
   */
  fun title(context: Context, views: RemoteViews, imageId: Int, textId: Int, text: String, face: Face, widthDp: Float, maxLines: Int, color: Int): Boolean {
    val image = image(context, text, face, widthDp, maxLines)
    if (image == null) {
      views.setViewVisibility(imageId, View.GONE)
      views.setViewVisibility(textId, View.VISIBLE)
      views.setTextViewText(textId, text)
      WidgetKit.textColor(context, views, textId, color)
      return false
    }
    views.setImageViewBitmap(imageId, image)
    WidgetKit.tint(context, views, imageId, color)
    views.setContentDescription(imageId, text)
    views.setViewVisibility(imageId, View.VISIBLE)
    views.setViewVisibility(textId, View.GONE)
    return true
  }

  /**
   * Sets `text` on one line of `face`, as large as fits `widthDp` from `maxSp` (a step smaller each
   * time, down to `minSp`, then cut), tinted `color`: the time, its AM or PM a smaller run of the
   * same text (spans hold). The plain twin takes `maxSp` too. The width it takes, in dp; `widthDp`
   * when the plain twin shows instead.
   */
  fun fitted(context: Context, views: RemoteViews, imageId: Int, textId: Int, text: CharSequence, face: Face, widthDp: Float, minSp: Float, color: Int, maxSp: Float = face.sizeSp): Float {
    val size = fittingSize(context, text, face, widthDp, minSp, maxSp)
    val image = size?.let { image(context, text, face, widthDp, 1, it) }
    if (image == null) {
      views.setViewVisibility(imageId, View.GONE)
      views.setViewVisibility(textId, View.VISIBLE)
      views.setTextViewText(textId, text)
      views.setTextViewTextSize(textId, TypedValue.COMPLEX_UNIT_SP, maxSp)
      WidgetKit.textColor(context, views, textId, color)
      return widthDp
    }
    views.setImageViewBitmap(imageId, image)
    WidgetKit.tint(context, views, imageId, color)
    views.setContentDescription(imageId, text.toString())
    views.setViewVisibility(imageId, View.VISIBLE)
    views.setViewVisibility(textId, View.GONE)
    return image.width / context.resources.displayMetrics.density
  }

  /** The largest size, from `maxSp` down to `minSp`, at which `text` fits `widthDp` on one line (`minSp` when none does); null when it cannot be measured. */
  private fun fittingSize(context: Context, text: CharSequence, face: Face, widthDp: Float, minSp: Float, maxSp: Float): Float? {
    if (text.isEmpty() || widthDp <= 0f) return null
    return try {
      val metrics = context.resources.displayMetrics
      val paint = paint(context, face, face.sizeSp) ?: return null
      val most = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, widthDp, metrics)
      var size = maxSp
      while (size > minSp) {
        paint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, size, metrics)
        if (Layout.getDesiredWidth(text, paint) <= most) return size
        size -= 1f
      }
      minSp
    } catch (_: Exception) {
      null
    }
  }

  private fun paint(context: Context, face: Face, sizeSp: Float): TextPaint? {
    val typeface = ResourcesCompat.getFont(context, face.font) ?: return null
    return TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
      this.typeface = typeface
      textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sizeSp, context.resources.displayMetrics)
      letterSpacing = face.trackingEm
      if (face.features.isNotEmpty()) fontFeatureSettings = face.features
      color = Color.BLACK
    }
  }

  /** The text as an alpha mask as wide as it needs (no wider than `widthDp`), at `sizeSp` (the face's own unless fitted), or null. */
  private fun image(context: Context, text: CharSequence, face: Face, widthDp: Float, maxLines: Int, sizeSp: Float = face.sizeSp): Bitmap? {
    if (text.isEmpty() || widthDp <= 0f) return null
    return try {
      val metrics = context.resources.displayMetrics
      val paint = paint(context, face, sizeSp) ?: return null
      val most = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, widthDp, metrics).toInt()
      if (most <= 0) return null
      val natural = ceil(Layout.getDesiredWidth(text, paint)).toInt()
      val width = natural.coerceIn(1, most)
      // The line height of the app's type (scaled with a fitted size): the space a line takes beyond the font's own.
      val line = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, face.lineSp * sizeSp / face.sizeSp, metrics)
      val fontLine = paint.fontMetrics.let { it.descent - it.ascent }
      val layout =
          StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
              .setMaxLines(maxLines)
              .setEllipsize(TextUtils.TruncateAt.END)
              .setIncludePad(false)
              .setLineSpacing((line - fontLine).coerceAtLeast(0f), 1f)
              .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
              .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
              .build()
      // The leading shared above the first line and below the last, as a text view with a line height sets it.
      val leading = (line - fontLine).coerceAtLeast(0f)
      val height = ceil(layout.height + leading).toInt().coerceAtLeast(1)
      val drawn = (0 until layout.lineCount).maxOfOrNull { layout.getLineWidth(it) } ?: 0f
      val bitmap = Bitmap.createBitmap(ceil(drawn).toInt().coerceIn(1, width), height, Bitmap.Config.ALPHA_8)
      val canvas = Canvas(bitmap)
      canvas.translate(0f, leading / 2)
      layout.draw(canvas)
      bitmap
    } catch (_: Exception) {
      null
    }
  }
}
