package com.stephenprn.unlease.launch

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** What opened the app, told apart from what only brings it back. */
object LaunchIntents {
  /**
   * Whether the activity is brought back rather than opened: Android recreating it after it stopped
   * the app, or a relaunch from Recents. Its intent is then the one that first opened the task (a
   * link, a widget's tap, a share), already followed: it becomes a plain launch, so React Native's
   * first link and the shares' intake never follow it twice (a prefilled form opening again).
   */
  fun forgetReplayed(activity: Activity, savedInstanceState: Bundle?): Boolean {
    val intent = activity.intent ?: return savedInstanceState != null
    val replayed = savedInstanceState != null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
    if (replayed && intent.action != Intent.ACTION_MAIN) {
      activity.intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(activity.packageName)
    }
    return replayed
  }
}
