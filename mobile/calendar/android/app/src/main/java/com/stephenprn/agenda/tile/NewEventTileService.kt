package com.stephenprn.agenda.tile

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.stephenprn.agenda.BuildConfig
import com.stephenprn.agenda.MainActivity
import com.stephenprn.agenda.R

/**
 * The Quick Settings tile « Nouvel événement »: one press opens the new event's form
 * (`unlease-agenda://new`, the form's own start: the next hour), the panel closing behind it; on a
 * locked phone, once it is unlocked. Its label is written again in the app's language when the panel
 * shows it (the system reads the manifest's in the phone's), as the widgets' words are.
 */
class NewEventTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    tile.label = getString(R.string.tile_new_event)
    tile.state = Tile.STATE_INACTIVE
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    if (isLocked) unlockAndRun { open() } else open()
  }

  private fun open() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.APP_SCHEME}://new"), this, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // From Android 14 an activity starts from a tile only through a PendingIntent.
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
