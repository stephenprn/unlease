package com.stephenprn.contacts.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.stephenprn.contacts.MainActivity

/** Where a widget's taps go: a page of the app, the quick window, or a contact to call or open (through the router). */
internal object WidgetIntents {
  private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  /** A grid's template takes each face's fill-in, so it must be mutable; explicit, its target stays ours, but what the launcher fills in is checked by the router. */
  private const val MUTABLE = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

  /** `unlease-contacts://…` in the app (RootNavigator's linking). */
  fun open(context: Context, uri: String): PendingIntent {
    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, 0, intent, IMMUTABLE)
  }

  /** The quick window over the home screen, to point the widget at other contacts. */
  fun quick(context: Context, widgetId: Int): PendingIntent {
    val intent =
        Intent(context, QuickActivity::class.java)
            // One PendingIntent per widget: the data only tells them apart.
            .setData(Uri.parse("unlease-contacts://quick/$widgetId"))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    return PendingIntent.getActivity(context, widgetId, intent, IMMUTABLE)
  }

  /**
   * A grid's faces call or open the contact their fill-in names, through the router. The launcher
   * holding a mutable template may fill in data of its own: so the fill-in names a contact only
   * (`WidgetRouterActivity`), never a number, and the widget's id rides in the template's extras,
   * which a fill-in cannot replace.
   */
  fun routeTemplate(context: Context, widgetId: Int): PendingIntent =
      PendingIntent.getActivity(context, widgetId, routerIntent(context, widgetId), MUTABLE)

  /** One face's own way there, where a grid cannot take fill-ins (Android 11 and older). */
  fun route(context: Context, widgetId: Int, uri: String): PendingIntent =
      PendingIntent.getActivity(context, "$widgetId $uri".hashCode(), routerIntent(context, widgetId).setData(Uri.parse(uri)), IMMUTABLE)

  fun routeFill(uri: String): Intent = Intent().setData(Uri.parse(uri))

  private fun routerIntent(context: Context, widgetId: Int): Intent =
      Intent(context, WidgetRouterActivity::class.java)
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
}
