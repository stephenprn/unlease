package com.stephenprn.carnet.widget

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.atomic.AtomicBoolean

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

  fun run(context: Context, done: () -> Unit) {
    val finished = AtomicBoolean(false)
    val finish = { if (finished.compareAndSet(false, true)) done() }
    val main = Handler(Looper.getMainLooper())
    main.postDelayed({ finish() }, TIMEOUT_MS)
    main.post {
      try {
        val host = (context.applicationContext as ReactApplication).reactHost
        if (host == null) {
          finish()
          return@post
        }
        val current = host.currentReactContext
        if (current != null) {
          start(current, finish)
        } else {
          host.addReactInstanceEventListener(
              object : ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                  host.removeReactInstanceEventListener(this)
                  start(context, finish)
                }
              },
          )
          host.start()
        }
      } catch (_: Exception) {
        finish()
      }
    }
  }

  private fun start(reactContext: ReactContext, finish: () -> Unit) {
    val tasks = HeadlessJsTaskContext.getInstance(reactContext)
    var started = -1
    tasks.addTaskEventListener(
        object : HeadlessJsTaskEventListener {
          override fun onHeadlessJsTaskStart(taskId: Int) = Unit

          override fun onHeadlessJsTaskFinish(taskId: Int) {
            if (taskId != started) return
            tasks.removeTaskEventListener(this)
            finish()
          }
        },
    )
    try {
      started = tasks.startTask(HeadlessJsTaskConfig(TASK, Arguments.createMap(), TIMEOUT_MS - 1_000, true))
    } catch (_: Exception) {
      finish()
    }
  }
}
