package com.stephenprn.unlease.mirror

import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentResolver
import android.content.Context
import android.net.Uri

/**
 * The app's own Android account, under which its records are copied into the phone's own (Contacts'
 * people into the address book, Agenda's events into the calendar: each app's `PhoneMirrorModule`).
 * Its type is the app's package and `.mirror` (`@string/unlease_account_type`, written by
 * dev-builds.gradle, the same), so a dev build's account is another one than the released app's, and
 * neither ever sees the other's rows. Every read and write of the mirror is limited to this type: the
 * phone's other accounts are never read nor touched. Removing the account (here, or from Android's
 * settings) makes the providers drop every row it held.
 */
object MirrorAccount {
  /** The account type: `<applicationId>.mirror`, the authenticator's declared type. */
  fun type(context: Context): String = context.packageName + ".mirror"

  fun find(context: Context): Account? = AccountManager.get(context).getAccountsByType(type(context)).firstOrNull()

  /**
   * The account, added under `name` when it is not there, syncable for `authority` (the provider shows
   * an account's rows only then) and never synced on Android's own schedule: the app writes it.
   */
  fun ensure(context: Context, name: String, authority: String): Account? {
    find(context)?.let { return it }
    val account = Account(name, type(context))
    if (!AccountManager.get(context).addAccountExplicitly(account, null, null)) return find(context)
    ContentResolver.setIsSyncable(account, authority, 1)
    ContentResolver.setSyncAutomatically(account, authority, false)
    return account
  }

  /** Removes every account of the type; true when none is left. */
  fun remove(context: Context): Boolean {
    val manager = AccountManager.get(context)
    for (account in manager.getAccountsByType(type(context))) manager.removeAccountExplicitly(account)
    return find(context) == null
  }

  /** A provider's address as the account's sync adapter writes through it: changes stay its own, deletes are final. */
  fun asSyncAdapter(uri: Uri, account: Account, callerParameter: String, nameParameter: String, typeParameter: String): Uri =
      uri.buildUpon()
          .appendQueryParameter(callerParameter, "true")
          .appendQueryParameter(nameParameter, account.name)
          .appendQueryParameter(typeParameter, account.type)
          .build()
}
