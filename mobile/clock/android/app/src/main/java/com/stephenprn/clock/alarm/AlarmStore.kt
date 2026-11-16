package com.stephenprn.clock.alarm

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/** What rings now: the alarm whole (it may be gone from the plan by the time it is snoozed), its moment, since when. */
internal data class RingRecord(
    val alarm: PlannedAlarm,
    /** The moment it was set to ring (its first ring, not a snooze's). */
    val at: Long,
    /** When it began to ring this time. */
    val since: Long,
    val snoozes: Int,
) {
  fun toJson(): String = JSONObject().put("alarm", alarm.toJson()).put("at", at).put("since", since).put("snoozes", snoozes).toString()

  companion object {
    fun parse(text: String?): RingRecord? {
      if (text.isNullOrEmpty()) return null
      return try {
        val json = JSONObject(text)
        val alarm = PlannedAlarm.fromJson(json.optJSONObject("alarm")) ?: return null
        RingRecord(alarm, json.optLong("at"), json.optLong("since"), json.optInt("snoozes"))
      } catch (_: Exception) {
        null
      }
    }
  }
}

/** A snoozed alarm: when it rings again, and what it is. */
internal data class Snooze(val record: RingRecord, val until: Long)

/**
 * The engine's memory, in the device's protected storage: readable before the phone is first
 * unlocked after a restart (Direct Boot), so alarms are armed again and ring then too. It holds the
 * plan as JavaScript handed it, which ring of each alarm already rang (`fired`, so none rings twice,
 * nor again after a restart), the snoozes, what rings now, the test ring, and what is armed. Writes
 * that decide whether an alarm rings are committed at once (`commit`), never left to a later flush.
 */
internal class AlarmStore(context: Context) {
  private val prefs: SharedPreferences = context.createDeviceProtectedStorageContext().getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun planText(): String? = prefs.getString(PLAN, null)

  fun plan(): Plan = Plan.parse(planText())

  fun savePlan(text: String) {
    prefs.edit().putString(PLAN, text).commit()
  }

  /** The moment of the last ring of this alarm that rang (or was given up as missed); 0 none. */
  fun fired(id: String): Long = prefs.getLong(FIRED + id, 0L)

  fun setFired(id: String, at: Long) {
    if (at > fired(id)) prefs.edit().putLong(FIRED + id, at).commit()
  }

  fun snoozes(): List<Snooze> =
      prefs.all.entries.mapNotNull { (key, value) ->
        if (!key.startsWith(SNOOZE) || value !is String) return@mapNotNull null
        try {
          val json = JSONObject(value)
          val record = RingRecord.parse(json.optString("record")) ?: return@mapNotNull null
          Snooze(record, json.optLong("until"))
        } catch (_: Exception) {
          null
        }
      }

  fun snooze(id: String): Snooze? = snoozes().firstOrNull { it.record.alarm.id == id }

  fun setSnooze(record: RingRecord, until: Long) {
    prefs.edit().putString(SNOOZE + record.alarm.id, JSONObject().put("record", record.toJson()).put("until", until).toString()).commit()
  }

  fun clearSnooze(id: String) {
    prefs.edit().remove(SNOOZE + id).commit()
  }

  fun ring(): RingRecord? = RingRecord.parse(prefs.getString(RING, null))

  fun setRing(record: RingRecord) {
    prefs.edit().putString(RING, record.toJson()).commit()
  }

  fun clearRing() {
    prefs.edit().remove(RING).commit()
  }

  /** The test ring (Réglages' « Essayer »): its alarm and its moment. */
  fun test(): Pair<PlannedAlarm, Long>? {
    val text = prefs.getString(TEST, null) ?: return null
    return try {
      val json = JSONObject(text)
      val alarm = PlannedAlarm.fromJson(json.optJSONObject("alarm")) ?: return null
      Pair(alarm, json.optLong("at"))
    } catch (_: Exception) {
      null
    }
  }

  fun setTest(alarm: PlannedAlarm, at: Long) {
    prefs.edit().putString(TEST, JSONObject().put("alarm", alarm.toJson()).put("at", at).toString()).commit()
  }

  fun clearTest() {
    prefs.edit().remove(TEST).commit()
  }

  /** What is armed in AlarmManager, by key (`ring:<id>`, `snooze:<id>`), so what is no longer wanted is taken back. */
  fun armed(): Set<String> = prefs.getStringSet(ARMED, emptySet())?.toSet() ?: emptySet()

  fun setArmed(keys: Set<String>, inexact: Boolean) {
    prefs.edit().putStringSet(ARMED, keys).putBoolean(INEXACT, inexact).commit()
  }

  fun inexact(): Boolean = prefs.getBoolean(INEXACT, false)

  companion object {
    private const val NAME = "clock.engine"
    private const val PLAN = "plan"
    private const val FIRED = "fired."
    private const val SNOOZE = "snooze."
    private const val RING = "ring"
    private const val TEST = "test"
    private const val ARMED = "armed"
    private const val INEXACT = "inexact"
    /** The test ring's id: never an alarm's (alarm ids are UUIDs). */
    const val TEST_ID = "__test__"
  }
}
