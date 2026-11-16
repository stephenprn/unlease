package com.stephenprn.clock.alarm

import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The engine counts rings as `@unlease/clock/services/schedule` does (its tests:
 * `packages/clock/src/services/__tests__/schedule.test.ts`): the same days, the same instants, the
 * nights the clocks change included. Instants are written as UTC here, as there.
 */
class NextRingTest {
  private val paris = TimeZone.getTimeZone("Europe/Paris")

  private fun utc(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
      (Civil.dayNumber(year, month, day) * 1440 + hour * 60 + minute) * Civil.MINUTE

  /** A wall time in Paris as an instant (no clock change in these). */
  private fun paris(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long = Civil.ringAt(Civil.dayNumber(year, month, day), hour * 60 + minute, paris)

  private fun alarm(minute: Int = 450, days: List<Int> = listOf(1, 2, 3, 4, 5), date: String? = null, skip: String? = null, quiet: List<String> = emptyList()) =
      PlannedAlarm("a", minute, days.fold(0) { mask, day -> mask or (1 shl day) }, Civil.parseDay(date), Civil.parseDay(skip), "Alarm", "", "melody", true, quiet.mapNotNull { Civil.parseDay(it) }.toSet())

  @Test
  fun countsDaysAsJavaScriptDoes() {
    assertEquals("2026-11-17", Civil.dayKey(Civil.dayNumber(2026, 11, 17)))
    assertEquals("2024-02-29", Civil.dayKey(Civil.parseDay("2024-02-29")!!))
    assertEquals("1969-12-31", Civil.dayKey(-1))
    // 16 November 2026 is a Monday (1), 22 November a Sunday (0).
    assertEquals(1, Civil.weekday(Civil.dayNumber(2026, 11, 16)))
    assertEquals(0, Civil.weekday(Civil.dayNumber(2026, 11, 22)))
    assertEquals(450, Civil.parseTime("07:30"))
    assertNull(Civil.parseTime("24:00"))
  }

  @Test
  fun ringsOnItsNextDayAtItsTime() {
    // Monday evening: Tuesday 07:30 in Paris (06:30 UTC in winter).
    val next = NextRing.after(alarm(), paris(2026, 11, 16, 21, 0), paris)!!
    assertEquals("2026-11-17", Civil.dayKey(next.day))
    assertEquals(utc(2026, 11, 17, 6, 30), next.at)
    // Monday morning before it rings: that morning.
    assertEquals("2026-11-16", Civil.dayKey(NextRing.after(alarm(), paris(2026, 11, 16, 6, 0), paris)!!.day))
    // At its very minute: the next day.
    assertEquals("2026-11-17", Civil.dayKey(NextRing.after(alarm(), paris(2026, 11, 16, 7, 30), paris)!!.day))
    // Friday after it rang: Monday.
    assertEquals("2026-11-23", Civil.dayKey(NextRing.after(alarm(), paris(2026, 11, 20, 8, 0), paris)!!.day))
  }

  @Test
  fun keepsASkippedDayQuiet() {
    assertEquals("2026-11-18", Civil.dayKey(NextRing.after(alarm(skip = "2026-11-17"), paris(2026, 11, 16, 21, 0), paris)!!.day))
    assertEquals("2026-11-17", Civil.dayKey(NextRing.after(alarm(skip = "2026-11-10"), paris(2026, 11, 16, 21, 0), paris)!!.day))
    // Once a week, its next one skipped: a week later.
    assertEquals("2026-11-29", Civil.dayKey(NextRing.after(alarm(600, listOf(0), skip = "2026-11-22"), paris(2026, 11, 21, 12, 0), paris)!!.day))
  }

  @Test
  fun keepsHolidaysAndDaysOffQuiet() {
    // Wednesday 11 November 2026 (Armistice) and Thursday 12 (a day off): from Tuesday evening, Friday.
    val quiet = alarm(quiet = listOf("2026-11-11", "2026-11-12"))
    assertEquals("2026-11-13", Civil.dayKey(NextRing.after(quiet, paris(2026, 11, 10, 21, 0), paris)!!.day))
    // A phone off then misses nothing on those days.
    assertNull(NextRing.lastBefore(quiet, paris(2026, 11, 11, 9, 0), paris)?.takeIf { Civil.dayKey(it.day) == "2026-11-11" })
  }

  @Test
  fun ringsAOneTimeAlarmOnce() {
    val once = alarm(375, emptyList(), date = "2026-11-17")
    assertEquals(paris(2026, 11, 17, 6, 15), NextRing.after(once, paris(2026, 11, 16, 21, 0), paris)!!.at)
    assertNull(NextRing.after(once, paris(2026, 11, 17, 6, 15), paris))
    assertNull(NextRing.after(alarm(375, emptyList(), date = null), paris(2026, 11, 16, 21, 0), paris))
  }

  @Test
  fun followsTheClocksAsJavaScriptDoes() {
    val night = alarm(150, listOf(0, 1, 2, 3, 4, 5, 6))
    // 29 March 2026: 2:30 does not exist in Paris; it rings at 3:30 (1:30 UTC).
    assertEquals(utc(2026, 3, 29, 1, 30), NextRing.after(night, paris(2026, 3, 28, 12, 0), paris)!!.at)
    // 25 October 2026: 2:30 happens twice; it rings the first time (0:30 UTC), and not again an hour later.
    assertEquals(utc(2026, 10, 25, 0, 30), NextRing.after(night, paris(2026, 10, 24, 12, 0), paris)!!.at)
    assertEquals("2026-10-26", Civil.dayKey(NextRing.after(night, utc(2026, 10, 25, 0, 30), paris)!!.day))
    // A daily 07:30 keeps its hour on the phone's clock across the change.
    val daily = alarm(450, listOf(0, 1, 2, 3, 4, 5, 6))
    assertEquals(utc(2026, 10, 25, 6, 30), NextRing.after(daily, paris(2026, 10, 24, 8, 0), paris)!!.at)
    assertEquals(utc(2026, 10, 26, 6, 30), NextRing.after(daily, paris(2026, 10, 25, 8, 0), paris)!!.at)
  }

  @Test
  fun findsTheRingAPhoneOffMissed() {
    val last = NextRing.lastBefore(alarm(), paris(2026, 11, 17, 7, 40), paris)!!
    assertEquals(paris(2026, 11, 17, 7, 30), last.at)
    // Saturday 8:00: the last weekday ring was Friday's.
    assertEquals("2026-11-20", Civil.dayKey(NextRing.lastBefore(alarm(), paris(2026, 11, 21, 8, 0), paris)!!.day))
  }

  @Test
  fun readsThePlanJavaScriptHands() {
    val plan =
        Plan.parse(
            """{"alarms":[{"id":"a","time":"07:30","days":[1,2,3,4,5],"date":null,"skipDay":"2026-11-17","title":"Work","label":"Work","sound":"bell","vibrate":false},{"id":"bad","time":"25:00"}],"settings":{"ringsHere":true,"snoozeMinutes":5,"silenceAfter":15,"rampSeconds":60,"volumeKeys":"snooze","words":{"snooze":"Répéter"}}}""",
        )
    assertEquals(1, plan.alarms.size)
    val read = plan.alarms[0]
    assertEquals(450, read.minute)
    assertEquals(0b0111110, read.days)
    assertEquals("2026-11-17", Civil.dayKey(read.skipDay!!))
    assertEquals("bell", read.sound)
    assertEquals(false, read.vibrate)
    assertEquals(5, plan.settings.snoozeMinutes)
    assertEquals("snooze", plan.settings.volumeKeys)
    assertEquals("Répéter", plan.settings.words.snooze)
    assertEquals("Stop", plan.settings.words.stop)
    // Unreadable: nothing rings from it, and nothing throws.
    assertEquals(0, Plan.parse("{broken").alarms.size)
    // Written back and read again, an alarm is the same.
    assertEquals(read, PlannedAlarm.fromJson(read.toJson()))
    // Its quiet days, read and written back.
    val quiet = PlannedAlarm.fromJson(org.json.JSONObject("""{"id":"q","time":"07:00","days":[1],"quiet":["2026-11-11","nope"]}"""))!!
    assertEquals(setOf(Civil.dayNumber(2026, 11, 11)), quiet.quiet)
    assertEquals(quiet, PlannedAlarm.fromJson(quiet.toJson()))
  }
}
