package com.stephenprn.unlease.launch

import android.content.ContentValues
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/**
 * What another app hands with an intent (Android's « Créer un contact », « Ajouter à l'agenda »), as
 * JSON for JavaScript, which reads it (Contacts' `app/handedContact.ts`, Agenda's `app/handedEvent.ts`):
 * its plain values (text, numbers, yes or no, lists of them), a contact's rows (`ContentValues`) as
 * objects of text. Anything else (a parcel of another app's classes, bytes) is left out and each text
 * is cut: another app chose them, so they only ever fill a form the person confirms.
 */
object IntentExtras {
  private const val MAX_TEXT = 20_000
  private const val MAX_ITEMS = 100

  fun toJson(intent: Intent): JSONObject {
    val out = JSONObject()
    // A parcel naming a class this app lacks throws as the extras are read: then nothing was handed.
    val extras = runCatching { intent.extras }.getOrNull() ?: return out
    val keys = runCatching { extras.keySet().toList() }.getOrNull() ?: return out
    for (key in keys.take(MAX_ITEMS)) {
      @Suppress("DEPRECATION")
      val value = runCatching { extras.get(key) }.getOrNull()
      plain(value)?.let { out.put(key, it) }
    }
    return out
  }

  private fun plain(value: Any?): Any? =
      when (value) {
        is CharSequence -> value.toString().take(MAX_TEXT)
        is Boolean, is Int, is Long -> value
        is Short -> value.toInt()
        is Byte -> value.toInt()
        is Float -> value.toDouble().takeIf { it.isFinite() }
        is Double -> value.takeIf { it.isFinite() }
        is ContentValues -> row(value)
        is Array<*> -> list(value.asList())
        is IntArray -> list(value.asList())
        is LongArray -> list(value.asList())
        is Iterable<*> -> list(value)
        else -> null
      }

  private fun list(items: Iterable<*>): JSONArray =
      JSONArray().apply { for (item in items.take(MAX_ITEMS)) plain(item)?.let { put(it) } }

  /** A data row: its column names (`mimetype`, `data1`…) and their values as text, bytes (a photo) left out. */
  private fun row(values: ContentValues): JSONObject =
      JSONObject().apply {
        for (key in values.keySet()) {
          val value = values.get(key)
          if (value == null || value is ByteArray) continue
          put(key, value.toString().take(MAX_TEXT))
        }
      }
}
