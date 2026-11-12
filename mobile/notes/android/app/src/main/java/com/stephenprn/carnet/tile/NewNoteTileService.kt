package com.stephenprn.carnet.tile

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.stephenprn.carnet.BuildConfig
import com.stephenprn.carnet.MainActivity

/**
 * The Quick Settings tile « Nouvelle note »: a tap opens a new note (`carnet://capture/note`, as the
 * quick actions widget's button and the launcher's shortcut do) and closes the panel. An action, not
 * a switch: always shown at rest. On a locked phone, the note opens once it is unlocked.
 */
class NewNoteTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    tile.state = Tile.STATE_INACTIVE
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    if (isLocked) unlockAndRun { open() } else open()
  }

  private fun open() {
    // singleTask: an app already open follows the link (onNewIntent) and keeps what it had under it.
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(NEW_NOTE), this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      // From Android 14 only a PendingIntent opens an activity from a tile.
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      @Suppress("DEPRECATION") startActivityAndCollapse(intent)
    }
  }

  private companion object {
    val NEW_NOTE = "${BuildConfig.APP_SCHEME}://capture/note"
  }
}
