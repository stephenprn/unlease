package com.stephenprn.unlease.reminders

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.stephenprn.unlease.headless.HeadlessTasks
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One run of the app's `remindersTask`, React started if the app is closed; on WorkManager's own thread, so it may wait. */
class RefreshWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val done = CountDownLatch(1)
    HeadlessTasks.run(applicationContext, RemindersRefresh.TASK, RemindersRefresh.TIMEOUT_MS) { done.countDown() }
    done.await(RemindersRefresh.TIMEOUT_MS + 5_000, TimeUnit.MILLISECONDS)
    // Never retried: the next period, or the next change, runs it again.
    return Result.success()
  }
}
