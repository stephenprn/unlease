package com.stephenprn.clock.widget

import android.content.Context
import android.os.Build
import android.widget.RemoteViews

/** Tints by day and at night, as the launcher shows the widget (as Agenda's `WidgetKit`). */
internal object WidgetKit {
  /** Tints an image with a colour resource. */
  fun tint(context: Context, views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(viewId, "setImageTintList", color)
    else views.setInt(viewId, "setColorFilter", context.getColor(color))
  }

  /** A text's colour from a resource, so it follows the launcher from day to night. */
  fun textColor(context: Context, views: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= 31) views.setColorStateList(viewId, "setTextColor", color)
    else views.setTextColor(viewId, context.getColor(color))
  }
}
