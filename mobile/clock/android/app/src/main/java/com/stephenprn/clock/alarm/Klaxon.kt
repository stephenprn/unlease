package com.stephenprn.clock.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.stephenprn.clock.R
import kotlin.math.min
import kotlin.math.pow

/** Clock's own sounds (`res/raw`, credited in docs/SOUNDS.md), by the keys alarms store (`@unlease/clock/services/sounds`). */
internal object Sounds {
  const val DEFAULT = "melody"
  const val SILENT = "silent"
  private const val PHONE = "phone:"

  fun raw(key: String): Int? =
      when (key) {
        "sunrise" -> R.raw.sunrise
        "birdsong" -> R.raw.birdsong
        "chimes" -> R.raw.chimes
        "bowl" -> R.raw.bowl
        "melody" -> R.raw.melody
        "bell" -> R.raw.bell
        "digital" -> R.raw.digital
        "groove" -> R.raw.groove
        "rooster" -> R.raw.rooster
        else -> null
      }

  /** A phone's sound's address (`phone:<uri>|<name>`). */
  fun phoneUri(key: String): Uri? {
    if (!key.startsWith(PHONE)) return null
    val rest = key.removePrefix(PHONE)
    val bar = rest.lastIndexOf('|')
    return Uri.parse(if (bar < 0) rest else rest.substring(0, bar))
  }

  /** Everything an alarm plays on: the alarm stream, so « Ne pas déranger » lets it through and its volume is the alarm's. */
  val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()

  /** Points a player at a sound; false when it cannot be read (a phone's sound on another phone, before the first unlock…). */
  fun load(context: Context, player: MediaPlayer, key: String): Boolean {
    try {
      val raw = raw(key)
      val uri = phoneUri(key)
      when {
        raw != null -> context.resources.openRawResourceFd(raw).use { player.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
        uri != null -> player.setDataSource(context, uri)
        key == SYSTEM -> player.setDataSource(context, RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM) ?: return false)
        else -> return false
      }
      return true
    } catch (error: Exception) {
      Log.w("ClockAlarm", "sound $key unreadable", error)
      return false
    }
  }

  /** The phone's own default alarm sound, the last before a plain tone. */
  const val SYSTEM = "system"
}

/**
 * What an alarm sounds and feels like while it rings: its sound on the alarm stream, looping, its
 * volume rising from a whisper over `rampSeconds`; vibration on its own track. Whatever fails to play
 * gives way to the next (the alarm's sound, Clock's default, the phone's own alarm sound, then a plain
 * tone): an alarm is never silent because a file could not be read. During a call (or a voice app's)
 * it plays at an eighth of its volume, as Android's own clock does, and vibrates; full again as soon
 * as the call ends, looked at every second. An alarm volume left at nothing is raised for the ring
 * and put back after it.
 */
internal class Klaxon(private val context: Context) {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(AudioManager::class.java)
  private var player: MediaPlayer? = null
  private var tone: ToneGenerator? = null
  private var vibrator: Vibrator? = null
  private var focus: AudioFocusRequest? = null
  private var startedAt = 0L
  private var rampMs = 0L
  private var stopped = false
  /** The alarm volume before the ring raised it from nothing, to put back. */
  private var raisedFrom: Int? = null

  fun start(sound: String, vibrate: Boolean, rampSeconds: Int) {
    stopped = false
    if (sound != Sounds.SILENT) {
      raiseFromNothing()
      play(listOf(sound, Sounds.DEFAULT, Sounds.SYSTEM).distinct(), rampSeconds)
    }
    if (vibrate || sound == Sounds.SILENT || inCall()) vibrate()
  }

  /** A call, a voice app's call, or one being screened or redirected. */
  private fun inCall(): Boolean = audio?.mode in CALL_MODES

  private fun play(sources: List<String>, rampSeconds: Int) {
    requestFocus()
    startedAt = System.currentTimeMillis()
    rampMs = rampSeconds * 1000L
    playFrom(sources, 0)
  }

  /** Plays the first source that works, from `index`; a player that fails while it plays moves on to the next. */
  private fun playFrom(sources: List<String>, index: Int) {
    if (stopped) return
    release()
    for (at in index until sources.size) {
      val next = MediaPlayer()
      try {
        next.setAudioAttributes(Sounds.ATTRIBUTES)
        if (!Sounds.load(context, next, sources[at])) {
          next.release()
          continue
        }
        next.isLooping = true
        next.setOnErrorListener { _, _, _ ->
          handler.post { playFrom(sources, at + 1) }
          true
        }
        next.prepare()
        applyVolume(next)
        next.start()
        player = next
        handler.removeCallbacks(watch)
        handler.post(watch)
        return
      } catch (error: Exception) {
        Log.w("ClockAlarm", "sound ${sources[at]} failed", error)
        next.release()
      }
    }
    playTone()
  }

  /** From -24 dB to full over the ramp, even steps in decibels (what the ear hears as even); an eighth of it during a call. */
  private fun volumeNow(): Float {
    val ramped =
        if (rampMs <= 0) 1f
        else {
          val t = min(1.0, (System.currentTimeMillis() - startedAt).toDouble() / rampMs)
          10.0.pow((-24.0 * (1 - t)) / 20.0).toFloat()
        }
    return if (inCall()) ramped * IN_CALL else ramped
  }

  private fun applyVolume(target: MediaPlayer) {
    val volume = volumeNow()
    try {
      target.setVolume(volume, volume)
    } catch (_: IllegalStateException) {}
  }

  /** The volume followed while it rings: the ramp a step every 200 ms, then a call's start or end every second. */
  private val watch =
      object : Runnable {
        override fun run() {
          val current = player ?: return
          if (stopped) return
          applyVolume(current)
          handler.postDelayed(this, if (System.currentTimeMillis() - startedAt < rampMs) 200L else 1000L)
        }
      }

  /** An alarm volume at nothing (or the phone's least) would ring unheard: a third of the way up for the ring. */
  private fun raiseFromNothing() {
    val manager = audio ?: return
    try {
      val now = manager.getStreamVolume(AudioManager.STREAM_ALARM)
      val least = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) manager.getStreamMinVolume(AudioManager.STREAM_ALARM) else 0
      if (now > least) return
      val floor = maxOf(least + 1, manager.getStreamMaxVolume(AudioManager.STREAM_ALARM) / 3)
      manager.setStreamVolume(AudioManager.STREAM_ALARM, floor, 0)
      raisedFrom = now
    } catch (error: Exception) {
      Log.w("ClockAlarm", "alarm volume left as it is", error)
    }
  }

  private fun putVolumeBack() {
    val before = raisedFrom ?: return
    raisedFrom = null
    try {
      audio?.setStreamVolume(AudioManager.STREAM_ALARM, before, 0)
    } catch (error: Exception) {
      Log.w("ClockAlarm", "alarm volume not put back", error)
    }
  }

  /** The last resort: the alarm stream's own beeps, every second and a half. */
  private fun playTone() {
    try {
      val generator = ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
      tone = generator
      val beep =
          object : Runnable {
            override fun run() {
              if (stopped) return
              generator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1000)
              handler.postDelayed(this, 1500L)
            }
          }
      handler.post(beep)
    } catch (error: Exception) {
      Log.w("ClockAlarm", "no tone either", error)
      vibrate()
    }
  }

  private fun vibrate() {
    if (vibrator != null) return
    val target =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
    if (target == null || !target.hasVibrator()) return
    vibrator = target
    val pattern = longArrayOf(0, 700, 500)
    when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
          target.vibrate(VibrationEffect.createWaveform(pattern, 0), VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
          @Suppress("DEPRECATION") target.vibrate(VibrationEffect.createWaveform(pattern, 0), Sounds.ATTRIBUTES)
      else -> @Suppress("DEPRECATION") target.vibrate(pattern, 0, Sounds.ATTRIBUTES)
    }
  }

  /**
   * Transient focus: music and videos pause while it rings. Losing it changes nothing: an alarm is
   * never hushed by another app (only by a call, `inCall`).
   */
  private fun requestFocus() {
    val manager = audio ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(Sounds.ATTRIBUTES).setOnAudioFocusChangeListener {}.build()
      focus = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION") manager.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun release() {
    player?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {}
      it.release()
    }
    player = null
  }

  fun stop() {
    stopped = true
    handler.removeCallbacksAndMessages(null)
    release()
    tone?.release()
    tone = null
    vibrator?.cancel()
    vibrator = null
    putVolumeBack()
    val manager = audio ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { manager.abandonAudioFocusRequest(it) } else @Suppress("DEPRECATION") manager.abandonAudioFocus(null)
    focus = null
  }

  private companion object {
    /** Android's own clock rings at an eighth of its volume during a call. */
    const val IN_CALL = 0.125f
    /** MODE_IN_CALL, MODE_IN_COMMUNICATION, MODE_CALL_SCREENING, MODE_CALL_REDIRECT, MODE_COMMUNICATION_REDIRECT. */
    val CALL_MODES = setOf(2, 3, 4, 5, 6)
  }
}

/** A sound heard as it will ring (the editor's and Réglages' pickers): on the alarm stream, at its volume, for 20 seconds at most. */
internal object SoundPreview {
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private val end = Runnable { stop() }

  fun play(context: Context, key: String) {
    stop()
    if (key == Sounds.SILENT) return
    val next = MediaPlayer()
    try {
      next.setAudioAttributes(Sounds.ATTRIBUTES)
      if (!Sounds.load(context, next, key) && !Sounds.load(context, next, Sounds.DEFAULT)) {
        next.release()
        return
      }
      next.isLooping = true
      next.prepare()
      next.start()
      player = next
      handler.postDelayed(end, 20_000L)
    } catch (error: Exception) {
      Log.w("ClockAlarm", "preview $key failed", error)
      next.release()
    }
  }

  fun stop() {
    handler.removeCallbacks(end)
    player?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {}
      it.release()
    }
    player = null
  }
}
