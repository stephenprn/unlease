package com.stephenprn.carnet.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * An item ticked on a note widget. It shows at once (`tickLocally`), waits in the store, and the app's
 * JavaScript writes it as the editor would (one write, synced), in a headless task if the app is closed.
 * A tick the task could not take is written the next time the app runs.
 */
class WidgetTickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    val checkId = intent.getStringExtra(EXTRA_CHECK) ?: return
    val checked = intent.getBooleanExtra(EXTRA_CHECKED, false)
    WidgetStore(context).addTick(checkId, checked)
    NoteWidgetProvider.tickLocally(context, checkId, checked)
    val pending = goAsync()
    WidgetTasks.run(context) { pending.finish() }
  }

  companion object {
    const val ACTION = "com.stephenprn.carnet.widget.TICK"
    const val EXTRA_CHECK = "com.stephenprn.carnet.widget.CHECK"
    const val EXTRA_CHECKED = "com.stephenprn.carnet.widget.CHECKED"
  }
}
