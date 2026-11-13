/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addPagesFrench } from '@unlease/pages/i18n';

import App from './App';
import { name as appName } from './app.json';
import { runSyncTask } from './src/app/syncTask';

// The design system's, Carnet's (its collections and links show in pages) and Pages' English.
addPagesFrench();

AppRegistry.registerComponent(appName, () => App);
// Sync with the app closed: every quarter of an hour, soon after changes are left unsent, and soon
// after a network, a VPN's too, comes up (mobile/shared/android, backgroundsync).
AppRegistry.registerHeadlessTask('syncTask', () => runSyncTask);
