package com.stephenprn.carnet.widget

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
import com.stephenprn.carnet.R
import kotlin.math.ceil

/**
 * Signika for a widget's titles. A launcher loads a widget's layout in a restricted context that
 * cannot read an app's fonts, so a title is set here, in the app, on an image the widget shows:
 * an alpha mask the image view tints with a colour resource, so it follows day and night. Each title
 * sits on a pair: the image, and a plain text view in the system font kept for when it cannot be
 * drawn (and for the launcher's previews, which draw the layout as it is).
 */
internal object WidgetType {
  enum class Face(val font: Int, val sizeSp: Float, val lineSp: Float) {
    /** A widget's head: a collection's, a label's or a note's name (DESIGN.md: title in label size, 600). */
    TITLE(R.font.signika_semibold, 16f, 22f),
    /** What a field says before anything is typed. */
    HINT(R.font.signika_regular, 16f, 23f),
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

  /** The text as an alpha mask as wide as it needs (no wider than `widthDp`), or null. */
  private fun image(context: Context, text: String, face: Face, widthDp: Float, maxLines: Int): Bitmap? {
    if (text.isEmpty() || widthDp <= 0f) return null
    return try {
      val metrics = context.resources.displayMetrics
      val typeface = ResourcesCompat.getFont(context, face.font) ?: return null
      val paint =
          TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
            this.typeface = typeface
            textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, face.sizeSp, metrics)
            color = Color.BLACK
          }
      val most = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, widthDp, metrics).toInt()
      if (most <= 0) return null
      val natural = ceil(Layout.getDesiredWidth(text, paint)).toInt()
      val width = natural.coerceIn(1, most)
      // The line height of the app's type: the space a line takes beyond the font's own.
      val line = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, face.lineSp, metrics)
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
