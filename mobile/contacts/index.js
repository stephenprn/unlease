/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addContactsEnglish } from '@unlease/contacts/i18n';

import App from './App';
import { name as appName } from './app.json';
import { QuickProviders } from './src/app/providers/QuickProviders';
import { QUICK_WINDOW } from './src/app/widgets';
import { onBackgroundEvent } from './src/platform/notifications';
import { runRemindersTask } from './src/app/birthdayAlerts';

// The design system's and Contacts' English, for every root below.
addContactsEnglish();

// Before registerComponent, as Notifee requires: a birthday notification pressed with the app closed opens it.
onBackgroundEvent();

AppRegistry.registerComponent(appName, () => App);
// The quick window over the home screen: « Appels rapides » pointed at the favourites or a label.
AppRegistry.registerComponent(QUICK_WINDOW, () => QuickProviders);
// The birthdays seen to with the app closed: twice a day while they are on, and after a restart, an
// update, a change of time, zone or language (mobile/shared/android/src/reminders, RemindersRefresh).
AppRegistry.registerHeadlessTask('remindersTask', () => runRemindersTask);
