package com.stephenprn.clock.tools

import android.content.Context
import android.content.SharedPreferences
import com.stephenprn.clock.alarm.AlarmStore
import org.json.JSONArray
import org.json.JSONObject

/**
 * A timer counting down on this phone, as `TimerRun` in `@unlease/clock/models/timer` (never synced):
 * running it ends at `endsAt`, paused it has `left` to go, ringing it ended at `endsAt`. `silenced`
 * is the engine's own: a ring given up after the ringing time, still shown until it is stopped.
 */
internal data class TimerRunRecord(
    val id: String,
    val timerId: String?,
    val label: String,
    val length: Long,
    val total: Long,
    val state: String,
    val endsAt: Long,
    val left: Long,
    val sound: String,
    val vibrate: Boolean,
    val startedAt: Long,
    val silenced: Boolean = false,
) {
  fun remaining(now: Long): Long = if (state == PAUSED) left else maxOf(0L, endsAt - now)

  fun toJson(): JSONObject =
      JSONObject()
          .put("id", id)
          .put("timerId", timerId ?: JSONObject.NULL)
          .put("label", label)
          .put("length", length)
          .put("total", total)
          .put("state", state)
          .put("endsAt", endsAt)
          .put("left", left)
          .put("sound", sound)
          .put("vibrate", vibrate)
          .put("startedAt", startedAt)
          .put("silenced", silenced)

  companion object {
    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val RINGING = "ringing"
    /** 99:59:59, as the keypad types at most. */
    const val MOST = (99 * 3600 + 59 * 60 + 59) * 1000L

    /** One run read back; null when it cannot be (no id, a state unknown), so one bad run never takes the others with it. */
    fun fromJson(json: JSONObject?): TimerRunRecord? {
      if (json == null) return null
      val id = json.optString("id").takeIf { it.isNotEmpty() && it.length <= 64 } ?: return null
      val state = json.optString("state").takeIf { it == RUNNING || it == PAUSED || it == RINGING } ?: return null
      val total = json.optLong("total").coerceIn(1000L, MOST + 60 * 60_000L)
      return TimerRunRecord(
          id = id,
          timerId = json.optString("timerId").takeUnless { json.isNull("timerId") || it.isEmpty() },
          label = json.optString("label").take(60),
          length = json.optLong("length", total).coerceIn(1000L, MOST),
          total = total,
          state = state,
          endsAt = json.optLong("endsAt"),
          left = json.optLong("left").coerceAtLeast(0L),
          sound = json.optString("sound").ifEmpty { "bell" },
          vibrate = json.optBoolean("vibrate", true),
          startedAt = json.optLong("startedAt"),
          silenced = json.optBoolean("silenced", false),
      )
    }
  }
}

/** The stopwatch, as `Stopwatch` in `@unlease/clock/models/stopwatch`: running from `startedAt` on top of `banked`, each lap the whole time then. */
internal data class StopwatchState(val startedAt: Long?, val banked: Long, val laps: List<Long>) {
  val running: Boolean get() = startedAt != null
  val reset: Boolean get() = startedAt == null && banked == 0L && laps.isEmpty()

  fun elapsed(now: Long): Long = banked + (startedAt?.let { maxOf(0L, now - it) } ?: 0L)

  fun toJson(): JSONObject = JSONObject().put("startedAt", startedAt ?: JSONObject.NULL).put("banked", banked).put("laps", JSONArray().also { array -> laps.forEach { array.put(it) } })

  companion object {
    val RESET = StopwatchState(null, 0L, emptyList())
    const val MOST_LAPS = 999

    fun parse(text: String?): StopwatchState {
      if (text.isNullOrEmpty()) return RESET
      return try {
        val json = JSONObject(text)
        val laps = ArrayList<Long>()
        json.optJSONArray("laps")?.let { array -> for (index in 0 until array.length()) array.optLong(index, -1L).takeIf { it >= 0 }?.let(laps::add) }
        StopwatchState(if (json.isNull("startedAt")) null else json.optLong("startedAt").takeIf { it > 0 }, json.optLong("banked").coerceAtLeast(0L), laps.takeLast(MOST_LAPS))
      } catch (_: Exception) {
        RESET
      }
    }
  }
}

/**
 * The timers and the stopwatch this phone runs, in its protected storage beside the alarms' engine
 * (`AlarmStore`): readable before the first unlock after a restart, so a timer still rings then.
 * Writes are committed at once, as the alarms' are.
 */
internal class ToolStore(context: Context) {
  private val prefs: SharedPreferences = context.createDeviceProtectedStorageContext().getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun runs(): List<TimerRunRecord> {
    val text = prefs.getString(RUNS, null) ?: return emptyList()
    return try {
      val array = JSONArray(text)
      (0 until array.length()).mapNotNull { TimerRunRecord.fromJson(array.optJSONObject(it)) }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun run(id: String): TimerRunRecord? = runs().firstOrNull { it.id == id }

  fun saveRuns(runs: List<TimerRunRecord>) {
    prefs.edit().putString(RUNS, JSONArray().also { array -> runs.sortedBy { it.startedAt }.forEach { array.put(it.toJson()) } }.toString()).commit()
  }

  fun stopwatch(): StopwatchState = StopwatchState.parse(prefs.getString(STOPWATCH, null))

  fun saveStopwatch(state: StopwatchState) {
    prefs.edit().putString(STOPWATCH, state.toJson().toString()).commit()
  }

  /** The words the engine shows for timers and the stopwatch, from the plan JavaScript handed the alarms' engine. */
  fun words(context: Context): ToolWords = ToolWords.fromJson(runCatching { JSONObject(AlarmStore(context).planText() ?: "{}").optJSONObject("settings")?.optJSONObject("words") }.getOrNull())

  companion object {
    private const val NAME = "clock.tools"
    private const val RUNS = "runs"
    private const val STOPWATCH = "stopwatch"
  }
}

/** What the engine says of timers and the stopwatch, in the app's language (`EngineWords` in `@unlease/clock/services/engine`). */
internal data class ToolWords(
    val timer: String,
    /** « Minuteur de {length} ». */
    val timerOf: String,
    val timeUp: String,
    /** « {count} minuteurs terminés ». */
    val timersUp: String,
    val addMinute: String,
    val pause: String,
    val resume: String,
    val stop: String,
    val delete: String,
    /** « En pause · {time} ». */
    val paused: String,
    val stopwatch: String,
    val lap: String,
    /** « Tour {number} ». */
    val lapNumber: String,
    val reset: String,
    val channelTimers: String,
    val channelTimersRinging: String,
    val channelStopwatch: String,
) {
  companion object {
    val ENGLISH =
        ToolWords("Timer", "{length} timer", "Time’s up", "{count} timers done", "+1 min", "Pause", "Resume", "Stop", "Delete", "Paused · {time}", "Stopwatch", "Lap", "Lap {number}", "Reset", "Timers", "Timers ringing", "Stopwatch")

    fun fromJson(json: JSONObject?): ToolWords {
      if (json == null) return ENGLISH
      fun word(key: String, fallback: String) = json.optString(key).ifEmpty { fallback }
      val e = ENGLISH
      return ToolWords(
          timer = word("timer", e.timer),
          timerOf = word("timerOf", e.timerOf),
          timeUp = word("timeUp", e.timeUp),
          timersUp = word("timersUp", e.timersUp),
          addMinute = word("addMinute", e.addMinute),
          pause = word("pause", e.pause),
          resume = word("resume", e.resume),
          stop = word("stop", e.stop),
          delete = word("delete", e.delete),
          paused = word("paused", e.paused),
          stopwatch = word("stopwatch", e.stopwatch),
          lap = word("lap", e.lap),
          lapNumber = word("lapNumber", e.lapNumber),
          reset = word("reset", e.reset),
          channelTimers = word("channelTimers", e.channelTimers),
          channelTimersRinging = word("channelTimersRinging", e.channelTimersRinging),
          channelStopwatch = word("channelStopwatch", e.channelStopwatch),
      )
    }
  }
}
