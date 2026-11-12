package com.stephenprn.unlease.backgroundsync

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.stephenprn.unlease.headless.HeadlessTasks
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * One run of the app's `syncTask`, React started if the app is closed; on WorkManager's own thread,
 * so it may wait. The run that follows changes (`RETRY_UNTIL_DONE`) is retried, with a growing wait,
 * until JavaScript says the server took them: a run that never said (it ran out of time) counts as
 * not done. The periodic run is never retried: the next period comes anyway.
 */
class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    BackgroundSync.clearOutcome(applicationContext)
    val done = CountDownLatch(1)
    HeadlessTasks.run(applicationContext, BackgroundSync.TASK, BackgroundSync.TIMEOUT_MS) { done.countDown() }
    done.await(BackgroundSync.TIMEOUT_MS + 5_000, TimeUnit.MILLISECONDS)
    val untilDone = inputData.getBoolean(BackgroundSync.RETRY_UNTIL_DONE, false)
    return if (untilDone && BackgroundSync.outcome(applicationContext) != "done") Result.retry() else Result.success()
  }
}
