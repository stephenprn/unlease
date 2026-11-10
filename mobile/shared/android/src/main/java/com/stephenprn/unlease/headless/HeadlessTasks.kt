package com.stephenprn.unlease.headless

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
 * Runs one of the app's JavaScript tasks (`AppRegistry.registerHeadlessTask`), starting React if the
 * app is closed, and calls `done` once it ends or after `timeoutMs`, whichever comes first. From a
 * broadcast (under its own limit) or a WorkManager worker, never a service: Android does not let a
 * closed app start a background service.
 */
object HeadlessTasks {
  fun run(context: Context, task: String, timeoutMs: Long, done: () -> Unit) {
    val finished = AtomicBoolean(false)
    val finish = { if (finished.compareAndSet(false, true)) done() }
    val main = Handler(Looper.getMainLooper())
    main.postDelayed({ finish() }, timeoutMs)
    main.post {
      try {
        val host = (context.applicationContext as ReactApplication).reactHost
        if (host == null) {
          finish()
          return@post
        }
        val current = host.currentReactContext
        if (current != null) {
          start(current, task, timeoutMs, finish)
        } else {
          host.addReactInstanceEventListener(
              object : ReactInstanceEventListener {
                override fun onReactContextInitialized(context: ReactContext) {
                  host.removeReactInstanceEventListener(this)
                  start(context, task, timeoutMs, finish)
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

  private fun start(reactContext: ReactContext, task: String, timeoutMs: Long, finish: () -> Unit) {
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
      // Its own limit a second under ours, so JavaScript ends it before `done` is called regardless.
      started = tasks.startTask(HeadlessJsTaskConfig(task, Arguments.createMap(), timeoutMs - 1_000, true))
    } catch (_: Exception) {
      finish()
    }
  }
}
