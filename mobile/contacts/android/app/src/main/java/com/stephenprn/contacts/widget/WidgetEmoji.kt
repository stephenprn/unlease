package com.stephenprn.contacts.widget

import android.graphics.Color
import android.icu.lang.UCharacter
import android.icu.lang.UProperty
import android.icu.text.BreakIterator
import android.os.Build
import android.text.Spannable
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan

/**
 * The emoji in a widget's Signika title. A title is set as an alpha mask the launcher tints, which
 * would draw an emoji as a silhouette in the title's ink: so the title is drawn twice from one layout,
 * the words alone on the mask and the emoji alone in their own colours on a second image laid over it
 * (as Carnet's `WidgetEmoji.kt`).
 */
internal object WidgetEmoji {
  private const val VARIATION_EMOJI = 0xFE0F
  private const val KEYCAP = 0x20E3

  /** Where `text`'s emoji are, each a whole cluster (a flag, a family, a skin tone, a keycap); empty when it has none. */
  fun ranges(text: String): List<IntRange> {
    if (text.none { it.isSurrogate() || it.code >= 0x2000 }) return emptyList()
    val found = mutableListOf<IntRange>()
    val clusters = BreakIterator.getCharacterInstance().apply { setText(text) }
    var start = clusters.first()
    var end = clusters.next()
    while (end != BreakIterator.DONE) {
      if (isEmoji(text, start, end)) found += start until end
      start = end
      end = clusters.next()
    }
    return found
  }

  /** A cluster an emoji font draws: one shown as emoji by default, or asked to be one (U+FE0F, a keycap). */
  private fun isEmoji(text: String, start: Int, end: Int): Boolean {
    val first = text.codePointAt(start)
    var at = start
    while (at < end) {
      val point = text.codePointAt(at)
      if (point == VARIATION_EMOJI || point == KEYCAP) return true
      at += Character.charCount(point)
    }
    if (first in 0x1F1E6..0x1F1FF) return true
    return if (Build.VERSION.SDK_INT >= 28) UCharacter.hasBinaryProperty(first, UProperty.EMOJI_PRESENTATION)
    else first in 0x1F300..0x1FAFF
  }

  /** `text` as one of the title's layers: the emoji drawn clear (the mask), or everything else (the emoji's own image). */
  fun layer(text: String, emoji: List<IntRange>, words: Boolean): Spannable =
      SpannableString(text).apply {
        var from = 0
        for (range in emoji) {
          if (words) clear(this, range.first, range.last + 1)
          else if (range.first > from) clear(this, from, range.first)
          from = range.last + 1
        }
        if (!words && from < text.length) clear(this, from, text.length)
      }

  private fun clear(text: Spannable, start: Int, end: Int) =
      text.setSpan(ForegroundColorSpan(Color.TRANSPARENT), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
}
