/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addClockFrench } from '@unlease/clock/i18n';

import App from './App';
import { name as appName } from './app.json';
import RingRoot from './src/ui/ring/RingRoot';
import TimerRoot from './src/ui/ring/TimerRoot';
import { runSyncTask } from './src/app/syncTask';
import { onNoticeEvent, runRemindersTask } from './src/app/evening';
import { onBackgroundNotices } from './src/platform/noticeEvents';

// The design system's, Agenda's and Clock's English, for every root below.
addClockFrench();

// Before registerComponent, as Notifee requires: a notice pressed with the app closed does what it says.
onBackgroundNotices(onNoticeEvent);

AppRegistry.registerComponent(appName, () => App);
// The ringing window, over the lock screen (alarm/RingActivity: the engine shows it as an alarm rings).
AppRegistry.registerComponent('ringWindow', () => RingRoot);
// A timer's window, over the lock screen (tools/TimerRingActivity: the engine shows it as a timer ends).
AppRegistry.registerComponent('timerWindow', () => TimerRoot);
// The notices seen to with the app closed: every hour, and after a restart, an update, a change of
// time, zone or language (mobile/shared/android/src/reminders, RemindersRefresh).
AppRegistry.registerHeadlessTask('remindersTask', () => runRemindersTask);
// Sync with the app closed: every quarter of an hour, soon after changes are left unsent, and soon
// after a network, a VPN's too, comes up (mobile/shared/android, backgroundsync).
AppRegistry.registerHeadlessTask('syncTask', () => runSyncTask);
