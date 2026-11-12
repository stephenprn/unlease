package com.stephenprn.unlease.backgroundsync

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Sync with the app closed: the app's `syncTask` (JavaScript, registered in index.js) run by
 * WorkManager whenever a network is there.
 *
 * - every quarter of an hour while a server is set (`PERIODIC`): what other devices wrote comes in,
 *   and anything left behind goes out;
 * - soon after the app leaves the screen with changes the server has not taken, or after a write
 *   made with the app closed (`SOON`), retried with a growing wait until the server takes them;
 * - soon after any network comes up, a VPN's included, while changes wait or the last sync is old:
 *   a server reached only at home or through a VPN gets them the moment it can (`SyncReceiver`).
 *
 * Android's default network request leaves VPNs out (`NET_CAPABILITY_NOT_VPN`): the watch removes
 * it, or a VPN coming up over a network already there would never be heard. The watch is a
 * `PendingIntent` the system keeps with the app closed, lost at a restart or an update, so it is
 * registered again then (`onSystemChange`). WorkManager keeps its work across both; a force stop
 * suspends everything until the app is opened again.
 */
object BackgroundSync {
  /** Registered in each app's index.js under this name. */
  const val TASK = "syncTask"
  /** Many changes then photos going up on a slow network: under WorkManager's ten minutes. */
  const val TIMEOUT_MS = 8 * 60_000L
  const val ACTION_NETWORK = "com.stephenprn.unlease.backgroundsync.NETWORK"
  /** The work that retries until JavaScript says the server took everything. */
  const val RETRY_UNTIL_DONE = "retryUntilDone"

  private const val PERIODIC = "unlease.sync.periodic"
  private const val SOON = "unlease.sync.soon"
  private const val PREFS = "unlease.sync"
  private const val ON = "on"
  private const val PENDING = "pending"
  private const val LAST_SYNC = "lastSyncAt"
  private const val OUTCOME = "outcome"
  /** WorkManager's shortest period. */
  private const val PERIOD_MINUTES = 15L
  /** A network that came with nothing waiting still pulls if the last sync is older than this. */
  private const val STALE_MS = 10 * 60_000L
  /** Networks come in bursts (Wi-Fi, then the VPN over it): one run, a moment after the last. */
  private const val SETTLE_SECONDS = 5L
  /** The first wait after a failed run; WorkManager doubles it each time, up to five hours. */
  private const val FIRST_RETRY_SECONDS = 30L

  private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private val connected: Constraints
    get() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  /** A server is set (or no longer): the period and the network watch follow. */
  fun configure(context: Context, on: Boolean) {
    val app = context.applicationContext
    prefs(app).edit().putBoolean(ON, on).apply()
    apply(app, on)
  }

  private fun apply(context: Context, on: Boolean) {
    val work = WorkManager.getInstance(context)
    if (!on) {
      work.cancelUniqueWork(PERIODIC)
      work.cancelUniqueWork(SOON)
      unwatchNetworks(context)
      return
    }
    val periodic = PeriodicWorkRequest.Builder(SyncWorker::class.java, PERIOD_MINUTES, TimeUnit.MINUTES).setConstraints(connected).build()
    // UPDATE keeps the period's running clock: asked at every start, it never pushes the next run back.
    work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic)
    watchNetworks(context)
  }

  /** What JavaScript last knew: changes the server has not taken, and when a sync last got through. */
  fun note(context: Context, pending: Int, lastSyncAt: Long) {
    prefs(context).edit().putInt(PENDING, pending).putLong(LAST_SYNC, lastSyncAt).apply()
  }

  /**
   * A run as soon as a network is there, after `delaySeconds`, retried until the server takes
   * everything. Asked again, it replaces the one waiting: a fresh reason starts the waits again.
   */
  fun soon(context: Context, delaySeconds: Long) {
    val app = context.applicationContext
    if (!prefs(app).getBoolean(ON, false)) return
    val request =
        OneTimeWorkRequest.Builder(SyncWorker::class.java)
            .setConstraints(connected)
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, FIRST_RETRY_SECONDS, TimeUnit.SECONDS)
            .setInputData(Data.Builder().putBoolean(RETRY_UNTIL_DONE, true).build())
            .build()
    WorkManager.getInstance(app).enqueueUniqueWork(SOON, ExistingWorkPolicy.REPLACE, request)
  }

  /** A network came up (`SyncReceiver`): a run if changes wait, or if the last sync is old. */
  fun onNetwork(context: Context) {
    val prefs = prefs(context)
    if (!prefs.getBoolean(ON, false)) return
    val stale = System.currentTimeMillis() - prefs.getLong(LAST_SYNC, 0L) > STALE_MS
    if (prefs.getInt(PENDING, 0) > 0 || stale) soon(context, SETTLE_SECONDS)
  }

  /** A restart or an update: the network watch is gone, and changes may be waiting. */
  fun onSystemChange(context: Context) {
    val app = context.applicationContext
    val prefs = prefs(app)
    if (!prefs.getBoolean(ON, false)) return
    apply(app, true)
    if (prefs.getInt(PENDING, 0) > 0) soon(app, SETTLE_SECONDS)
  }

  /** What the last run of `syncTask` said (`report`): "done", "retry", or null when it never said. */
  fun outcome(context: Context): String? = prefs(context).getString(OUTCOME, null)

  fun clearOutcome(context: Context) {
    prefs(context).edit().remove(OUTCOME).commit()
  }

  fun report(context: Context, outcome: String) {
    prefs(context).edit().putString(OUTCOME, outcome).commit()
  }

  private fun networkIntent(context: Context, create: Boolean): PendingIntent? {
    val intent = Intent(context, SyncReceiver::class.java).setAction(ACTION_NETWORK)
    // Mutable so the system may add which network came (unused); explicit, so Android allows it.
    val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val flags = mutable or if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE
    return PendingIntent.getBroadcast(context, 0, intent, flags)
  }

  private fun watchNetworks(context: Context) {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return
    val intent = networkIntent(context, true) ?: return
    val request =
        NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            // A VPN is the way to the server, often: heard too.
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()
    // The same intent registered again replaces the earlier request: never more than one.
    try {
      manager.registerNetworkCallback(request, intent)
    } catch (_: Exception) {
      // Too many requests or a restricted profile: the period still runs.
    }
  }

  private fun unwatchNetworks(context: Context) {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return
    val intent = networkIntent(context, false) ?: return
    try {
      manager.unregisterNetworkCallback(intent)
    } catch (_: Exception) {
      // Never registered.
    }
    intent.cancel()
  }
}
