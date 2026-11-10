package com.stephenprn.contacts.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.stephenprn.contacts.R
import org.json.JSONObject

/**
 * Appels rapides: the favourites, or one label's contacts, as a grid of faces on a slab of the
 * ground. A tap calls the face's number at once (its contact through the router, which finds the
 * number in this widget's picture, then `Calls.place`); a face with no number opens its contact. The head names the list and opens it in the app. Pointed at its
 * list as it is placed, and again from the launcher (reconfigurable): the quick window's picker.
 */
class CallsWidgetProvider : ContactsWidgetProvider() {

  override fun draw(context: Context, manager: AppWidgetManager, id: Int): RemoteViews {
    val store = WidgetStore(context)
    val target = store.target(id)
    if (target.isEmpty()) return WidgetMessage.choose(context, id)
    val data = store.payload(id) ?: return WidgetMessage.waiting(context)
    if (data.optBoolean("gone")) return WidgetMessage.gone(context, id)

    val label = data.optString("kind") == "label"
    val title = data.optString("title")
    val views = widgetViews(context, R.layout.widget_calls)
    val width = WidgetType.widthDp(manager, id)
    // Beside the mark (24), the chevron (20) and the head's paddings.
    WidgetType.title(context, views, R.id.calls_title_image, R.id.calls_title, title, WidgetType.Face.TITLE, width - 84f, 1, R.color.wgen_ink)
    views.setContentDescription(R.id.calls_open, title)
    if (label) {
      views.setImageViewResource(R.id.calls_mark, R.drawable.wgen_tag)
      WidgetKit.tint(context, views, R.id.calls_mark, WidgetRes.pigments[data.optString("color")] ?: R.color.wgen_pigment_grey)
    } else {
      views.setImageViewResource(R.id.calls_mark, R.drawable.wgen_g_star)
    }
    val list = WidgetIntents.open(context, "unlease-contacts://${data.optString("open").ifEmpty { "favorites" }}")
    views.setOnClickPendingIntent(R.id.calls_open, list)
    views.setOnClickPendingIntent(R.id.calls_empty_open, list)
    views.setTextViewText(R.id.calls_empty_text, context.getString(if (label) R.string.widget_calls_empty_label else R.string.widget_calls_empty_favorites))

    val people = data.optJSONArray("people")
    val cells = mutableListOf<Pair<Long, RemoteViews>>()
    val missing = mutableListOf<String>()
    var photos = 0
    for (i in 0 until (people?.length() ?: 0)) {
      val person = people!!.optJSONObject(i) ?: continue
      // A launcher takes a widget's pictures in one parcel: past a dozen, initials.
      val photo = if (photos < MAX_PHOTOS) Faces.photo(context, person.optString("photo"), person.optString("local")) else null
      if (photo != null) photos += 1 else if (person.optString("photo").isNotEmpty()) missing += person.optString("photo")
      cells += WidgetKit.key(person.optString("id")) to cell(context, id, person, photo)
    }
    WidgetKit.grid(context, views, R.id.calls_grid, R.id.calls_static, R.id.calls_empty, cells, width, WidgetIntents.routeTemplate(context, id))
    Faces.fetch(context, missing, store.shared().optJSONObject("server"))
    return views
  }

  private fun cell(context: Context, widgetId: Int, person: JSONObject, photo: android.graphics.Bitmap?): RemoteViews =
      widgetViews(context, R.layout.widget_calls_cell).apply {
        setTextViewText(R.id.face_name, person.optString("name"))
        setContentDescription(R.id.cell, person.optString("said"))
        if (photo != null) {
          setImageViewBitmap(R.id.face_photo, photo)
          setViewVisibility(R.id.face_photo, View.VISIBLE)
          setViewVisibility(R.id.face_tile, View.GONE)
          setViewVisibility(R.id.face_initials, View.GONE)
        } else {
          val color = person.optString("color")
          WidgetKit.tint(context, this, R.id.face_tile, WidgetRes.pigments[color] ?: R.color.wgen_pigment_grey)
          val letters = Faces.initials(context, person.optString("initials"))
          if (letters != null) {
            setImageViewBitmap(R.id.face_initials, letters)
          } else {
            setImageViewResource(R.id.face_initials, R.drawable.wgen_g_person_ink_muted)
          }
          WidgetKit.tint(context, this, R.id.face_initials, WidgetRes.onPigments[color] ?: R.color.wgen_on_grey)
        }
        val contact = person.optString("id")
        val call = person.optString("call")
        WidgetKit.route(context, widgetId, this, R.id.cell, WidgetRouterActivity.uri(if (call.isNotEmpty()) WidgetRouterActivity.CALL else WidgetRouterActivity.OPEN, contact))
      }

  private companion object {
    const val MAX_PHOTOS = 12
  }
}
