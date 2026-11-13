package com.stephenprn.unlease.mirror

import android.accounts.Account
import android.app.Service
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderClient
import android.content.Context
import android.content.Intent
import android.content.SyncResult
import android.os.Bundle
import android.os.IBinder

/**
 * The mirror account's sync adapter, declared so the phone treats the account as one that holds
 * contacts or events (Contacts reads its `CONTACTS_STRUCTURE` through it: read-only rows and the
 * « Ouvrir dans Contacts » row; a calendar app lists its calendars). It fetches nothing: the copy is
 * one way and written by the app itself whenever its records change (`PhoneMirrorModule`), so a sync
 * Android asks for has nothing to do. Exported because Android's contacts and calendar apps find it
 * through the package manager; binding it does nothing either.
 */
class MirrorSyncService : Service() {
  override fun onCreate() {
    super.onCreate()
    synchronized(lock) { if (adapter == null) adapter = Adapter(applicationContext) }
  }

  override fun onBind(intent: Intent?): IBinder? = adapter?.syncAdapterBinder

  private class Adapter(context: Context) : AbstractThreadedSyncAdapter(context, true, false) {
    override fun onPerformSync(account: Account?, extras: Bundle?, authority: String?, provider: ContentProviderClient?, syncResult: SyncResult?) {
      // One way, written by the app: nothing to fetch.
    }
  }

  private companion object {
    val lock = Any()
    var adapter: Adapter? = null
  }
}
