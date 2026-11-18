/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addContactsFrench } from '@unlease/contacts/i18n';
import { addWalletFrench } from '@unlease/wallet/i18n';

import App from './App';
import { name as appName } from './app.json';
import { runSyncTask } from './src/app/syncTask';

// The design system's, Contacts' (whom a paper concerns), Agenda's (its days) and Wallet's English.
addContactsFrench();
addWalletFrench();

AppRegistry.registerComponent(appName, () => App);
// Sync with the app closed: every quarter of an hour, soon after changes are left unsent, and soon
// after a network, a VPN's too, comes up (mobile/shared/android, backgroundsync). Only sealed records travel.
AppRegistry.registerHeadlessTask('syncTask', () => runSyncTask);
