package com.stephenprn.carnet.widget

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import com.stephenprn.carnet.MainActivity

/**
 * Where a widget list's taps land: one template serves a whole list, so a row names its destination
 * as data, a page of the app (`carnet://…`) or a website, and this sends it on. It never shows.
 */
class WidgetRouterActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val uri = intent?.data
    if (uri != null) {
      val next =
          if (uri.scheme == "carnet") {
            Intent(Intent.ACTION_VIEW, uri, this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          } else if (uri.scheme == "https" || uri.scheme == "http") {
            Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          } else {
            null
          }
      try {
        if (next != null) startActivity(next)
      } catch (_: ActivityNotFoundException) {
        // No browser for it: the tap does nothing rather than crash.
      }
    }
    finish()
  }
}
