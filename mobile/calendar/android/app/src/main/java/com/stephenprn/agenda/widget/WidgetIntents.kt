package com.stephenprn.agenda.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.stephenprn.agenda.MainActivity

/** Where a widget's taps go: a page of the app, the quick window, or another app of the suite (through the router). */
internal object WidgetIntents {
  private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  /** A list's template takes each row's fill-in, so it must be mutable; explicit, its target stays ours, but what the launcher fills in is checked by the router. */
  private const val MUTABLE = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

  /** `unlease-agenda://…` in the app (RootNavigator's linking); the request code tells taps apart. */
  fun open(context: Context, uri: String, code: Int = 0): PendingIntent {
    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, code, intent, IMMUTABLE)
  }

  /** The quick window over the home screen, to point a countdown at another event. */
  fun quick(context: Context, widgetId: Int): PendingIntent {
    val intent =
        Intent(context, QuickActivity::class.java)
            // One PendingIntent per widget: the data only tells them apart.
            .setData(Uri.parse("unlease-agenda://quick/$widgetId"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    return PendingIntent.getActivity(context, widgetId, intent, IMMUTABLE)
  }

  /** A list's rows open what their fill-in names, through the router. */
  fun routeTemplate(context: Context, widgetId: Int): PendingIntent =
      PendingIntent.getActivity(context, widgetId, routerIntent(context), MUTABLE)

  /** One row's own way there, where a list cannot take fill-ins (Android 11 and older). */
  fun route(context: Context, uri: String): PendingIntent =
      PendingIntent.getActivity(context, uri.hashCode(), routerIntent(context).setData(Uri.parse(uri)), IMMUTABLE)

  fun routeFill(uri: String): Intent = Intent().setData(Uri.parse(uri))

  private fun routerIntent(context: Context): Intent =
      Intent(context, WidgetRouterActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
}
