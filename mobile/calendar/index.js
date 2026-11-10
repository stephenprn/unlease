/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addCalendarEnglish } from '@unlease/calendar/i18n';

import App from './App';
import { name as appName } from './app.json';
import { QuickProviders } from './src/app/providers/QuickProviders';
import { QUICK_WINDOW } from './src/app/widgets';
import { onBackgroundEvent } from './src/platform/notifications';
import { runRemindersTask } from './src/app/reminders';

// The design system's, Carnet's, Contacts' and Agenda's English, for every root below.
addCalendarEnglish();

// Before registerComponent, as Notifee requires: a reminder pressed with the app closed opens it.
onBackgroundEvent();

AppRegistry.registerComponent(appName, () => App);
// The quick window over the home screen: « Compte à rebours » pointed at its event.
AppRegistry.registerComponent(QUICK_WINDOW, () => QuickProviders);
// The reminders seen to with the app closed: every hour, and after a restart, an update, a change of
// time, zone or language (mobile/shared/android/src/reminders, RemindersRefresh).
AppRegistry.registerHeadlessTask('remindersTask', () => runRemindersTask);
