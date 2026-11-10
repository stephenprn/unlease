package com.stephenprn.carnet.widget

import android.content.Context
import com.stephenprn.unlease.headless.HeadlessTasks

/**
 * Runs the app's widget task in JavaScript (`src/app/widgets.ts`), starting React if the app is
 * closed: it writes the waiting ticks, draws the widgets again and sends the change. From a
 * broadcast, not a service: Android does not let a closed app start a background service.
 */
internal object WidgetTasks {
  /** Registered in index.js under the same name. */
  private const val TASK = "widgetTask"
  /** Under a broadcast's own limit; a tick not written by then waits for the next run. */
  private const val TIMEOUT_MS = 9_000L

  fun run(context: Context, done: () -> Unit) = HeadlessTasks.run(context, TASK, TIMEOUT_MS, done)
}
