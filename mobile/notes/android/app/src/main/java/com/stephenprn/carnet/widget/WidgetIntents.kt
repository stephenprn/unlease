package com.stephenprn.carnet.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.stephenprn.carnet.MainActivity

/** Where a widget's taps go: a page of the app, the quick window, a website, or a tick. */
internal object WidgetIntents {
  private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  /** A list's template takes each row's fill-in, so it must be mutable; it is explicit, so nothing else can fill it. */
  private const val MUTABLE = PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

  /** `carnet://…` in the app: the board answers it (RootNavigator's linking). */
  fun open(context: Context, uri: String): PendingIntent {
    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, 0, intent, IMMUTABLE)
  }

  /** The quick window over the home screen, for `mode` (`link`, `collection`, `label`, `note`). */
  fun quick(context: Context, mode: String, widgetId: Int, target: String = ""): PendingIntent {
    val intent =
        Intent(context, QuickActivity::class.java)
            // One PendingIntent per widget and mode: the data only tells them apart.
            .setData(Uri.parse("carnet://quick/$mode/$widgetId"))
            .putExtra(QuickActivity.EXTRA_MODE, mode)
            .putExtra(QuickActivity.EXTRA_TARGET, target)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    return PendingIntent.getActivity(context, widgetId, intent, IMMUTABLE)
  }

  /** A list's rows open what their fill-in names, through the router: a page of the app or a website. */
  fun routeTemplate(context: Context, widgetId: Int): PendingIntent =
      PendingIntent.getActivity(context, widgetId, routerIntent(context), MUTABLE)

  /** One row's own way there, where a list cannot take fill-ins (Android 11 and older). */
  fun route(context: Context, uri: String): PendingIntent =
      PendingIntent.getActivity(context, 0, routerIntent(context).setData(Uri.parse(uri)), IMMUTABLE)

  fun routeFill(uri: String): Intent = Intent().setData(Uri.parse(uri))

  private fun routerIntent(context: Context): Intent =
      Intent(context, WidgetRouterActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)

  /** A checklist's rows tick through this broadcast; each fill-in names its item and what it becomes. */
  fun tickTemplate(context: Context, widgetId: Int): PendingIntent =
      PendingIntent.getBroadcast(context, widgetId, tickIntent(context, widgetId), MUTABLE)

  fun tick(context: Context, widgetId: Int, checkId: String, checked: Boolean): PendingIntent =
      PendingIntent.getBroadcast(
          context,
          widgetId,
          tickIntent(context, widgetId).setData(Uri.parse("carnet://tick/$checkId/$checked")).putExtras(tickFill(checkId, checked)),
          IMMUTABLE,
      )

  fun tickFill(checkId: String, checked: Boolean): Intent =
      Intent().putExtra(WidgetTickReceiver.EXTRA_CHECK, checkId).putExtra(WidgetTickReceiver.EXTRA_CHECKED, checked)

  private fun tickIntent(context: Context, widgetId: Int): Intent =
      Intent(context, WidgetTickReceiver::class.java)
          .setAction(WidgetTickReceiver.ACTION)
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
}
