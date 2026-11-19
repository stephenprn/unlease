package com.stephenprn.carnet.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.carnet.BuildConfig
import com.stephenprn.carnet.R

/**
 * Actions rapides (the class keeps the capture bar's name, so a bar already placed becomes this): each
 * button starts its action in the quick window over the home screen, as Classer un lien does, and
 * the app stays closed; only search opens it (`carnet://capture/search`), its results being the
 * board. One row is the app's bottom bar, the rarer actions giving way as it narrows; two rows add
 * the search strip and name them.
 */
class CaptureWidgetProvider : CarnetWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    if (Build.VERSION.SDK_INT >= 31) {
      return RemoteViews(
          mapOf(
              SizeF(150f, 40f) to bar(context, id, NARROW),
              SizeF(250f, 40f) to bar(context, id, MEDIUM),
              SizeF(330f, 40f) to bar(context, id, FULL),
              SizeF(160f, 110f) to tall(context, manager, id),
          ),
      )
    }
    val options = manager.getAppWidgetOptions(id)
    val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
    return when {
      height >= 110 -> tall(context, manager, id)
      width >= 330 -> bar(context, id, FULL)
      width >= 250 -> bar(context, id, MEDIUM)
      else -> bar(context, id, NARROW)
    }
  }

  private fun bar(context: Context, id: Int, shown: Set<Int>): RemoteViews =
      widgetViews(context, R.layout.widget_quick).apply {
        for ((view, _) in ACTIONS) setViewVisibility(view, if (view in shown) View.VISIBLE else View.GONE)
        link(context, this, id)
      }

  private fun tall(context: Context, manager: AppWidgetManager, id: Int): RemoteViews =
      widgetViews(context, R.layout.widget_quick_tall).apply {
        // The strip's paddings and the mark (30) aside.
        val room = WidgetType.widthDp(manager, id) - 84f
        WidgetType.title(context, this, R.id.quick_search_hint_image, R.id.quick_search_hint, context.getString(R.string.widget_search_hint), WidgetType.Face.HINT, room, 1, R.color.wgen_ink_muted)
        link(context, this, id)
      }

  private fun link(context: Context, views: RemoteViews, id: Int) {
    for ((view, action) in ACTIONS) {
      val press =
          when (action) {
            "search" -> WidgetIntents.open(context, "${BuildConfig.APP_SCHEME}://capture/search")
            "link" -> WidgetIntents.quick(context, "link", id)
            else -> WidgetIntents.quick(context, "new", id, action)
          }
      views.setOnClickPendingIntent(view, press)
    }
  }

  private companion object {
    val ACTIONS =
        listOf(
            R.id.quick_search to "search",
            R.id.quick_checklist to "checklist",
            R.id.quick_photo to "photo",
            R.id.quick_camera to "camera",
            R.id.quick_link to "link",
            R.id.quick_reminder to "reminder",
            R.id.quick_note to "note",
        )
    val FULL = ACTIONS.map { it.first }.toSet()
    val MEDIUM = setOf(R.id.quick_search, R.id.quick_checklist, R.id.quick_camera, R.id.quick_link, R.id.quick_note)
    val NARROW = setOf(R.id.quick_checklist, R.id.quick_link, R.id.quick_note)
  }
}
