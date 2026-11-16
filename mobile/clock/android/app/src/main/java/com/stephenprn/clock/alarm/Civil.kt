package com.stephenprn.clock.alarm

import java.util.Locale
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

/**
 * Days and times of day on the phone's clock, counted exactly as JavaScript counts them
 * (`@unlease/calendar/services/time`, `@unlease/clock/services/schedule`), number for number: a day is
 * its number since 1970-01-01, a time of day its minute, a zone's offset read from the platform's
 * time zone data. No `java.time` (Android 7 has none without desugaring), and the same arithmetic as
 * the app shows, so the alarm rings exactly when the app says it will.
 */
internal object Civil {
  const val MINUTE = 60_000L
  const val HOUR = 3_600_000L
  private const val MINUTES_A_DAY = 1440L

  /** The day number of a civil date (Howard Hinnant's days_from_civil, proleptic Gregorian). */
  fun dayNumber(year: Int, month: Int, day: Int): Long {
    val y = (if (month <= 2) year - 1 else year).toLong()
    val era = Math.floorDiv(y, 400L)
    val yoe = y - era * 400
    val mp = ((month + 9) % 12).toLong()
    val doy = (153 * mp + 2) / 5 + day - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
  }

  /** `2026-11-17` from a day number. */
  fun dayKey(number: Long): String {
    val z = number + 719_468
    val era = Math.floorDiv(z, 146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val day = doy - (153 * mp + 2) / 5 + 1
    val month = if (mp < 10) mp + 3 else mp - 9
    val year = yoe + era * 400 + if (month <= 2) 1 else 0
    return String.format(Locale.ROOT, "%04d-%02d-%02d", year, month, day)
  }

  /** A day as stored (`2026-11-17`), or null. */
  fun parseDay(value: String?): Long? {
    val match = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(value ?: return null) ?: return null
    val (year, month, day) = match.destructured
    return dayNumber(year.toInt(), month.toInt(), day.toInt())
  }

  /** `07:30` as a minute of the day, or null. */
  fun parseTime(value: String?): Int? {
    val match = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$").find(value ?: return null) ?: return null
    return match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
  }

  /** 0 Sunday … 6 Saturday, as `Date` and Agenda count them. */
  fun weekday(day: Long): Int = Math.floorMod(day + 4, 7L).toInt()

  /** Minutes the zone is ahead of UTC at an instant. */
  private fun offset(instant: Long, zone: TimeZone): Long = zone.getOffset(instant).toLong() / MINUTE

  /**
   * The instant a wall time is in a zone: a time the clocks skip is read with the offset before it
   * (it lands an hour later), as `wallToInstant` does.
   */
  private fun wallToInstant(day: Long, minute: Int, zone: TimeZone): Long {
    val asUtc = (day * MINUTES_A_DAY + minute) * MINUTE
    val first = offset(asUtc, zone)
    val guess = asUtc - first * MINUTE
    val second = offset(guess, zone)
    if (second == first) return guess
    val other = asUtc - second * MINUTE
    return if (offset(other, zone) == second) min(guess, other) else max(guess, other)
  }

  /** The day and the minute an instant is on the zone's clock. */
  fun wallOf(instant: Long, zone: TimeZone): Pair<Long, Int> {
    val local = Math.floorDiv(instant, MINUTE) + offset(instant, zone)
    return Pair(Math.floorDiv(local, MINUTES_A_DAY), Math.floorMod(local, MINUTES_A_DAY).toInt())
  }

  fun dayOf(instant: Long, zone: TimeZone): Long = wallOf(instant, zone).first

  /** When an alarm set for `minute` rings on `day`: a time the clocks repeat rings the first time (`ringAt`). */
  fun ringAt(day: Long, minute: Int, zone: TimeZone): Long {
    val at = wallToInstant(day, minute, zone)
    val hourBefore = at - HOUR
    return if (wallOf(hourBefore, zone) == Pair(day, minute)) hourBefore else at
  }
}
