package com.stephenprn.agenda.mirror

import android.Manifest
import android.accounts.Account
import android.content.ContentProviderOperation
import android.content.ContentValues
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.stephenprn.agenda.BuildConfig
import com.stephenprn.unlease.mirror.MirrorAccount
import com.stephenprn.unlease.specs.NativePhoneMirrorSpec
import java.util.TimeZone
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Agenda's events copied into the phone's own calendar, one way, under the app's account
 * (`MirrorAccount`), as JavaScript plans them (`@unlease/calendar/services/phoneMirror`,
 * `mobile/calendar/src/app/phoneMirror.ts`): a calendar per source (one's own, each followed one; its
 * `_SYNC_ID` the source's id, `CAL_SYNC1` its fingerprint), read-only for the phone's other apps
 * (`CAL_ACCESS_READ`), and events (`_SYNC_ID` the event's id, `SYNC_DATA1` its fingerprint) without
 * alarms: Agenda rings its own reminders. Each event names the app as the one that shows it best
 * (`CUSTOM_APP_PACKAGE`, `CUSTOM_APP_URI`, `EventOpenActivity`).
 *
 * Every query and write names the account's type: the phone's other calendars are never read.
 */
class PhoneMirrorModule(private val reactContext: ReactApplicationContext) : NativePhoneMirrorSpec(reactContext) {

  private val io = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "phone-mirror").apply { isDaemon = true } }

  private fun background(promise: Promise, work: () -> Any?) {
    io.execute {
      try {
        promise.resolve(work())
      } catch (error: Exception) {
        promise.reject("phone_mirror", error.message ?: error.javaClass.simpleName, error)
      }
    }
  }

  private fun permitted(): Boolean =
      listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all {
        ContextCompat.checkSelfPermission(reactContext, it) == PackageManager.PERMISSION_GRANTED
      }

  private val type: String
    get() = MirrorAccount.type(reactContext)

  private fun syncUri(uri: Uri, account: Account): Uri =
      MirrorAccount.asSyncAdapter(uri, account, CalendarContract.CALLER_IS_SYNCADAPTER, Calendars.ACCOUNT_NAME, Calendars.ACCOUNT_TYPE)

  override fun isOn(promise: Promise) = background(promise) { MirrorAccount.find(reactContext) != null }

  override fun turnOn(accountName: String, promise: Promise) = background(promise) {
    permitted() && MirrorAccount.ensure(reactContext, accountName, CalendarContract.AUTHORITY) != null
  }

  override fun turnOff(promise: Promise) = background(promise) {
    val account = MirrorAccount.find(reactContext)
    if (account != null && permitted()) {
      // Removing the account drops its calendars too; done first, so none outlives a removal that fails.
      reactContext.contentResolver.delete(syncUri(Calendars.CONTENT_URI, account), "${Calendars.ACCOUNT_TYPE}=?", arrayOf(type))
    }
    MirrorAccount.remove(reactContext)
  }

  /** `{ calendars: [{ id, fingerprint }], events: [{ id, fingerprint }] }`, of the account alone. */
  override fun written(promise: Promise) = background(promise) {
    val calendars = JSONArray()
    val events = JSONArray()
    if (permitted()) {
      for ((id, row) in calendarRows()) calendars.put(JSONObject().put("id", id).put("fingerprint", row.fingerprint))
      for ((id, rows) in eventRows()) for (row in rows) events.put(JSONObject().put("id", id).put("fingerprint", row.fingerprint))
    }
    JSONObject().put("calendars", calendars).put("events", events).toString()
  }

  private data class Written(val rowId: Long, val fingerprint: String, val calendarId: Long = 0)

  /** The account's calendars by source id. */
  private fun calendarRows(): Map<String, Written> {
    val out = HashMap<String, Written>()
    reactContext.contentResolver.query(
        Calendars.CONTENT_URI,
        arrayOf(Calendars._ID, Calendars._SYNC_ID, Calendars.CAL_SYNC1),
        "${Calendars.ACCOUNT_TYPE}=?",
        arrayOf(type),
        null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getString(1) ?: continue
        out[id] = Written(cursor.getLong(0), cursor.getString(2) ?: "")
      }
    }
    return out
  }

  /** The account's events by event id (two, after a run cut short). */
  private fun eventRows(): Map<String, List<Written>> {
    val out = HashMap<String, MutableList<Written>>()
    reactContext.contentResolver.query(
        Events.CONTENT_URI,
        arrayOf(Events._ID, Events._SYNC_ID, Events.SYNC_DATA1, Events.CALENDAR_ID),
        "${Events.ACCOUNT_TYPE}=? AND ${Events.DELETED}=0",
        arrayOf(type),
        null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getString(1) ?: continue
        out.getOrPut(id) { mutableListOf() } += Written(cursor.getLong(0), cursor.getString(2) ?: "", cursor.getLong(3))
      }
    }
    return out
  }

  /** `{ calendars: { upserts, deletes }, events: { upserts, deletes } }`; resolves with the rows changed. */
  override fun apply(batch: String, promise: Promise) = background(promise) {
    if (!permitted()) return@background 0.0
    val account = MirrorAccount.find(reactContext) ?: return@background 0.0
    val json = JSONObject(batch)
    var changed = calendars(account, json.optJSONObject("calendars") ?: JSONObject())
    changed += events(account, json.optJSONObject("events") ?: JSONObject())
    changed.toDouble()
  }

  private fun calendars(account: Account, changes: JSONObject): Int {
    val resolver = reactContext.contentResolver
    val uri = syncUri(Calendars.CONTENT_URI, account)
    val held = calendarRows()
    var changed = 0
    val deletes = changes.optJSONArray("deletes") ?: JSONArray()
    for (index in 0 until deletes.length()) {
      val row = held[deletes.getString(index)] ?: continue
      // A calendar takes its events with it.
      changed += resolver.delete(uri, "${Calendars._ID}=? AND ${Calendars.ACCOUNT_TYPE}=?", arrayOf(row.rowId.toString(), type))
    }
    val upserts = changes.optJSONArray("upserts") ?: JSONArray()
    for (index in 0 until upserts.length()) {
      val calendar = upserts.getJSONObject(index)
      val id = calendar.getString("id")
      val values = ContentValues().apply {
        put(Calendars.NAME, calendar.optString("name"))
        put(Calendars.CALENDAR_DISPLAY_NAME, calendar.optString("name"))
        put(Calendars.CALENDAR_COLOR, colorOf(calendar.optString("color")) ?: Color.GRAY)
        put(Calendars.CAL_SYNC1, calendar.getString("fingerprint"))
      }
      val existing = held[id]
      if (existing != null) {
        resolver.update(uri, values, "${Calendars._ID}=?", arrayOf(existing.rowId.toString()))
      } else {
        values.apply {
          put(Calendars.ACCOUNT_NAME, account.name)
          put(Calendars.ACCOUNT_TYPE, account.type)
          put(Calendars._SYNC_ID, id)
          put(Calendars.OWNER_ACCOUNT, account.name)
          put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_READ)
          put(Calendars.VISIBLE, if (calendar.optBoolean("visible", true)) 1 else 0)
          put(Calendars.SYNC_EVENTS, 1)
          put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
          put(Calendars.CAN_ORGANIZER_RESPOND, 0)
          put(Calendars.CAN_MODIFY_TIME_ZONE, 0)
        }
        resolver.insert(uri, values)
      }
      changed += 1
    }
    return changed
  }

  private fun events(account: Account, changes: JSONObject): Int {
    val resolver = reactContext.contentResolver
    val uri = syncUri(Events.CONTENT_URI, account)
    val calendars = calendarRows()
    val held = eventRows()
    val ops = ArrayList<ContentProviderOperation>()
    var changed = 0
    val flush = {
      if (ops.isNotEmpty()) {
        resolver.applyBatch(CalendarContract.AUTHORITY, ops)
        ops.clear()
      }
    }
    val deletes = changes.optJSONArray("deletes") ?: JSONArray()
    for (index in 0 until deletes.length()) {
      for (row in held[deletes.getString(index)].orEmpty()) {
        ops += ContentProviderOperation.newDelete(uri).withSelection("${Events._ID}=?", arrayOf(row.rowId.toString())).build()
        changed += 1
        if (ops.size >= BATCH) flush()
      }
    }
    val upserts = changes.optJSONArray("upserts") ?: JSONArray()
    for (index in 0 until upserts.length()) {
      val event = upserts.getJSONObject(index)
      val id = event.getString("id")
      val calendar = calendars[event.getString("calendarId")] ?: continue
      val values = valuesOf(event, id)
      val existing = held[id]?.singleOrNull()
      if (existing != null && existing.calendarId == calendar.rowId) {
        ops += ContentProviderOperation.newUpdate(uri).withSelection("${Events._ID}=?", arrayOf(existing.rowId.toString())).withValues(values).build()
      } else {
        // New, moved to another calendar, or held twice: written afresh.
        for (row in held[id].orEmpty()) ops += ContentProviderOperation.newDelete(uri).withSelection("${Events._ID}=?", arrayOf(row.rowId.toString())).build()
        ops += ContentProviderOperation.newInsert(uri).withValues(values).withValue(Events.CALENDAR_ID, calendar.rowId).withValue(Events._SYNC_ID, id).build()
      }
      changed += 1
      if (ops.size >= BATCH) flush()
    }
    flush()
    return changed
  }

  /** An event's columns as `CalendarContract` wants them: a series with its RRULE and DURATION (no DTEND), the others with DTEND. */
  private fun valuesOf(event: JSONObject, id: String): ContentValues = ContentValues().apply {
    put(Events.SYNC_DATA1, event.getString("fingerprint"))
    put(Events.TITLE, event.optString("title"))
    put(Events.DESCRIPTION, event.optString("description"))
    put(Events.EVENT_LOCATION, event.optString("location"))
    put(Events.ALL_DAY, if (event.optBoolean("allDay")) 1 else 0)
    put(Events.DTSTART, event.getLong("start"))
    put(Events.EVENT_TIMEZONE, event.optString("timeZone").ifEmpty { "UTC" })
    putNull(Events.EVENT_END_TIMEZONE)
    val rrule = event.optStringOrNull("rrule")
    if (rrule != null) {
      putNull(Events.DTEND)
      put(Events.DURATION, event.optStringOrNull("duration") ?: "P0S")
      put(Events.RRULE, rrule)
      put(Events.EXDATE, event.optStringOrNull("exdate"))
    } else {
      put(Events.DTEND, event.optLong("end", event.getLong("start")))
      putNull(Events.DURATION)
      putNull(Events.RRULE)
      putNull(Events.EXDATE)
    }
    val color = colorOf(event.optStringOrNull("color"))
    if (color != null) put(Events.EVENT_COLOR, color) else putNull(Events.EVENT_COLOR)
    // Agenda rings its own reminders: none here, or the phone would ring twice.
    put(Events.HAS_ALARM, 0)
    put(Events.GUESTS_CAN_MODIFY, 0)
    put(Events.CUSTOM_APP_PACKAGE, reactContext.packageName)
    put(Events.CUSTOM_APP_URI, "${BuildConfig.APP_SCHEME}://" + event.optString("open").ifEmpty { "event/${Uri.encode(id)}" })
  }

  private fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

  private fun colorOf(hex: String?): Int? = try {
    if (hex.isNullOrEmpty()) null else Color.parseColor(hex)
  } catch (_: IllegalArgumentException) {
    null
  }

  private companion object {
    const val BATCH = 300
  }
}
