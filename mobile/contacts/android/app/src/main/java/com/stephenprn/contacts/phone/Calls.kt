package com.stephenprn.contacts.phone

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat

/**
 * Placing a call, for the app and its widgets alike. With CALL_PHONE (asked at the first call) the
 * call starts at once (`ACTION_CALL`), as Google's direct dial does: a quick call that opened the
 * dialer would ask a second tap. Without it the dialer opens with the number (`ACTION_DIAL`, no
 * permission), so a refusal never leaves a tap doing nothing. Emergency numbers always go through the
 * dialer (Android refuses them to `ACTION_CALL`).
 */
object Calls {
  /** 'call', 'dial', or 'none' when nothing on the phone takes calls (a tablet). */
  fun place(context: Context, number: String): String {
    val digits = number.trim()
    if (digits.isEmpty()) return "none"
    val uri = Uri.fromParts("tel", digits, null)
    val direct = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
    val asCall = Intent(Intent.ACTION_CALL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (direct) {
      try {
        context.startActivity(asCall)
        return "call"
      } catch (_: ActivityNotFoundException) {
        // Fall through to the dialer.
      } catch (_: SecurityException) {
        // An emergency number, or the permission taken back meanwhile.
      }
    }
    return try {
      context.startActivity(Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      "dial"
    } catch (_: ActivityNotFoundException) {
      "none"
    }
  }
}
