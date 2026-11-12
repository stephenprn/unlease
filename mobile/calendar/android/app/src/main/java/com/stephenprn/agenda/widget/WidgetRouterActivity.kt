package com.stephenprn.agenda.widget

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.stephenprn.agenda.BuildConfig
import com.stephenprn.agenda.MainActivity

/**
 * Where a widget list's taps land: one template serves the whole list, so a row names its
 * destination as data: a page of the app (`unlease-agenda://event/<id>`), or another app of the
 * suite (a note's reminder in Carnet, `carnet://note/<id>`; a page, `unlease-pages://page/<id>`). A
 * relative one (`event/<id>`) is the app's. It never shows.
 *
 * The launcher may fill in the list's mutable template with data of its own: anything but a page of
 * the suite's apps (whose links any app may open anyway, each app resolving the id itself) does
 * nothing, so a tap never views another scheme (`tel:`, `file:`, a website) as this app.
 */
class WidgetRouterActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val uri = intent?.data
    try {
      when {
        uri == null -> Unit
        uri.scheme == BuildConfig.APP_SCHEME -> startActivity(Intent(Intent.ACTION_VIEW, uri, this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
        uri.scheme == null -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://$uri"), this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
        (uri.scheme ?: "") in SUITE_SCHEMES -> startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        else -> Unit
      }
    } catch (_: ActivityNotFoundException) {
      // Nothing takes it (the other app is not installed): the app itself opens instead.
      runCatching { startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
    finish()
  }

  private companion object {
    /** The other apps of the suite a row may open (`APPS`' schemes, `-dev` in a dev build): a note's reminder, a page's day. */
    val SUITE_SCHEMES = setOf("carnet", "unlease-pages", "unlease-contacts").map { it + BuildConfig.SCHEME_SUFFIX }.toSet()
  }
}
