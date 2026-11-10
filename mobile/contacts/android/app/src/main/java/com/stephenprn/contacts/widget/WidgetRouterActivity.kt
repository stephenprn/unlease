package com.stephenprn.contacts.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.stephenprn.contacts.MainActivity
import com.stephenprn.contacts.phone.Calls
import org.json.JSONObject

/**
 * Where a widget grid's taps land: one template serves the whole grid, so a face names its contact
 * as data: `unlease-contacts://call/<id>`, whose number is placed at once (`Calls.place`: a direct
 * call with CALL_PHONE, else the dialer), or `unlease-contacts://contact/<id>`, opened in the app. It
 * never shows.
 *
 * The launcher may fill in a mutable template's data with anything, so a tap names no number: the
 * contact must be one of the faces the widget shows (its id from the template's extras, which a
 * fill-in cannot replace), and the number called is the one JavaScript handed for that face
 * (`widgetPayloads.ts`). Anything else does nothing.
 */
class WidgetRouterActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      route()
    } catch (_: ActivityNotFoundException) {
      // Nothing takes it: the tap does nothing rather than crash.
    }
    finish()
  }

  private fun route() {
    val widgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: return
    val uri = intent?.data ?: return
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID || uri.scheme != SCHEME) return
    val contact = uri.pathSegments.singleOrNull() ?: return
    val face = shown(widgetId, contact) ?: return
    when (uri.host) {
      CALL -> face.optString("call").takeIf { it.isNotEmpty() }?.let { Calls.place(this, it) }
      OPEN ->
          startActivity(
              Intent(Intent.ACTION_VIEW, Uri.parse(uri(OPEN, contact)), this, MainActivity::class.java)
                  .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
          )
    }
  }

  /** The face of `contact` in the picture widget `widgetId` shows now, or null. */
  private fun shown(widgetId: Int, contact: String): JSONObject? {
    val people = WidgetStore(this).payload(widgetId)?.optJSONArray("people") ?: return null
    for (i in 0 until people.length()) {
      val face = people.optJSONObject(i) ?: continue
      if (face.optString("id") == contact) return face
    }
    return null
  }

  companion object {
    private const val SCHEME = "unlease-contacts"
    /** Calls the contact's number on the widget. */
    const val CALL = "call"
    /** Opens the contact in the app (RootNavigator's `contact/<id>`). */
    const val OPEN = "contact"

    fun uri(action: String, contact: String): String = "$SCHEME://$action/${Uri.encode(contact)}"
  }
}
