package com.stephenprn.clock.alarm

import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

/** One alarm as JavaScript hands it (`EngineAlarm`, `@unlease/clock/services/engine`). */
internal data class PlannedAlarm(
    val id: String,
    /** Its time as a minute of the day (07:30 is 450). */
    val minute: Int,
    /** The weekdays it rings, a bit each (bit 0 Sunday … bit 6 Saturday); 0: once, on `date`. */
    val days: Int,
    /** A one-time alarm's day number. */
    val date: Long?,
    /** A day this repeating alarm stays quiet. */
    val skipDay: Long?,
    val title: String,
    val label: String,
    val sound: String,
    val vibrate: Boolean,
    /** The day numbers this repeating alarm keeps quiet because of Agenda (public holidays, days off), as JavaScript counted them. */
    val quiet: Set<Long> = emptySet(),
) {
  fun toJson(): JSONObject =
      JSONObject()
          .put("id", id)
          .put("time", String.format(java.util.Locale.ROOT, "%02d:%02d", minute / 60, minute % 60))
          .put("days", JSONArray().also { array -> for (day in 0..6) if (days and (1 shl day) != 0) array.put(day) })
          .put("date", date?.let { Civil.dayKey(it) } ?: JSONObject.NULL)
          .put("skipDay", skipDay?.let { Civil.dayKey(it) } ?: JSONObject.NULL)
          .put("title", title)
          .put("label", label)
          .put("sound", sound)
          .put("vibrate", vibrate)
          .put("quiet", JSONArray().also { array -> for (day in quiet.sorted()) array.put(Civil.dayKey(day)) })

  companion object {
    /** One alarm read back; null when it cannot ring (no time, no id), so one bad alarm never takes the others with it. */
    fun fromJson(json: JSONObject?): PlannedAlarm? {
      if (json == null) return null
      val id = json.optString("id").takeIf { it.isNotEmpty() } ?: return null
      val minute = Civil.parseTime(json.optString("time")) ?: return null
      var days = 0
      json.optJSONArray("days")?.let { array -> for (index in 0 until array.length()) array.optInt(index, -1).takeIf { it in 0..6 }?.let { days = days or (1 shl it) } }
      val quiet = HashSet<Long>()
      json.optJSONArray("quiet")?.let { array -> for (index in 0 until array.length()) Civil.parseDay(array.optString(index))?.let { quiet.add(it) } }
      return PlannedAlarm(
          id = id,
          minute = minute,
          days = days,
          date = Civil.parseDay(json.optString("date").takeUnless { json.isNull("date") }),
          skipDay = Civil.parseDay(json.optString("skipDay").takeUnless { json.isNull("skipDay") }),
          title = json.optString("title").ifEmpty { "Alarm" },
          label = json.optString("label"),
          sound = json.optString("sound").ifEmpty { "melody" },
          vibrate = json.optBoolean("vibrate", true),
          quiet = quiet,
      )
    }
  }
}

/** The words the engine shows on its own, in the app's language (`EngineWords`). */
internal data class EngineWords(
    val snooze: String,
    val stop: String,
    val ringing: String,
    /** « Répétée jusqu'à {time} ». */
    val snoozedUntil: String,
    val missed: String,
    val channelRinging: String,
    val channelNotices: String,
) {
  companion object {
    val ENGLISH = EngineWords("Snooze", "Stop", "Alarm", "Snoozed until {time}", "Missed alarm", "Alarms ringing", "Alarm notices")

    fun fromJson(json: JSONObject?): EngineWords {
      if (json == null) return ENGLISH
      fun word(key: String, fallback: String) = json.optString(key).ifEmpty { fallback }
      return EngineWords(
          snooze = word("snooze", ENGLISH.snooze),
          stop = word("stop", ENGLISH.stop),
          ringing = word("ringing", ENGLISH.ringing),
          snoozedUntil = word("snoozedUntil", ENGLISH.snoozedUntil),
          missed = word("missed", ENGLISH.missed),
          channelRinging = word("channelRinging", ENGLISH.channelRinging),
          channelNotices = word("channelNotices", ENGLISH.channelNotices),
      )
    }
  }
}

/** How this phone rings (`EngineSettings`). */
internal data class RingSettings(
    val ringsHere: Boolean,
    val snoozeMinutes: Int,
    val silenceAfter: Int,
    val rampSeconds: Int,
    /** `volume`, `snooze` or `stop`. */
    val volumeKeys: String,
    val words: EngineWords,
)

/** Everything the engine was handed last. */
internal class Plan(val alarms: List<PlannedAlarm>, val settings: RingSettings) {
  fun alarm(id: String): PlannedAlarm? = alarms.firstOrNull { it.id == id }

  companion object {
    val DEFAULT_SETTINGS = RingSettings(true, 10, 10, 30, "volume", EngineWords.ENGLISH)
    val EMPTY = Plan(emptyList(), DEFAULT_SETTINGS)

    /** The plan as stored; what cannot be read takes its default, and an alarm that cannot ring is left out alone. */
    fun parse(text: String?): Plan {
      if (text.isNullOrEmpty()) return EMPTY
      val json = try {
        JSONObject(text)
      } catch (_: Exception) {
        return EMPTY
      }
      val alarms = mutableListOf<PlannedAlarm>()
      json.optJSONArray("alarms")?.let { array -> for (index in 0 until array.length()) PlannedAlarm.fromJson(array.optJSONObject(index))?.let(alarms::add) }
      val settings = json.optJSONObject("settings")
      val d = DEFAULT_SETTINGS
      return Plan(
          alarms,
          RingSettings(
              ringsHere = settings?.optBoolean("ringsHere", d.ringsHere) ?: d.ringsHere,
              snoozeMinutes = (settings?.optInt("snoozeMinutes", d.snoozeMinutes) ?: d.snoozeMinutes).coerceIn(1, 60),
              silenceAfter = (settings?.optInt("silenceAfter", d.silenceAfter) ?: d.silenceAfter).coerceIn(1, 60),
              rampSeconds = (settings?.optInt("rampSeconds", d.rampSeconds) ?: d.rampSeconds).coerceIn(0, 600),
              volumeKeys = settings?.optString("volumeKeys")?.takeIf { it == "snooze" || it == "stop" } ?: "volume",
              words = EngineWords.fromJson(settings?.optJSONObject("words")),
          ),
      )
    }
  }
}

/** A ring: the day it is on, and the instant. */
internal data class Ring(val day: Long, val at: Long)

/**
 * When an alarm rings, as `@unlease/clock/services/schedule` counts it: a repeating alarm on its days
 * but its skipped one and its quiet ones (holidays, days off), a one-time alarm on its day; a time the clocks skip an hour later, one they
 * repeat the first time (`Civil.ringAt`).
 */
internal object NextRing {
  /** Two weeks: a skipped day of an alarm that rings once a week still finds the next one. */
  private const val HORIZON_DAYS = 15

  private fun ringsOn(alarm: PlannedAlarm, day: Long): Boolean =
      if (alarm.days == 0) alarm.date == day else alarm.days and (1 shl Civil.weekday(day)) != 0 && alarm.skipDay != day && day !in alarm.quiet

  /** The first ring strictly after `after`, or null (a one-time alarm gone by). */
  fun after(alarm: PlannedAlarm, after: Long, zone: TimeZone): Ring? {
    if (alarm.days == 0) {
      val date = alarm.date ?: return null
      val at = Civil.ringAt(date, alarm.minute, zone)
      return if (at > after) Ring(date, at) else null
    }
    // From the day before: past midnight on a clock that went back, a time can still be ahead.
    val from = Civil.dayOf(after, zone) - 1
    for (index in 0..HORIZON_DAYS) {
      val day = from + index
      if (!ringsOn(alarm, day)) continue
      val at = Civil.ringAt(day, alarm.minute, zone)
      if (at > after) return Ring(day, at)
    }
    return null
  }

  /** The last ring at or before `now`, within the two days before (what a phone off at that moment missed). */
  fun lastBefore(alarm: PlannedAlarm, now: Long, zone: TimeZone): Ring? {
    val today = Civil.dayOf(now, zone)
    for (index in 0..2) {
      val day = today + 1 - index
      if (!ringsOn(alarm, day)) continue
      val at = Civil.ringAt(day, alarm.minute, zone)
      if (at <= now) return Ring(day, at)
    }
    return null
  }
}
