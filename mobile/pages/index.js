/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import { addPagesEnglish } from '@unlease/pages/i18n';

import App from './App';
import { name as appName } from './app.json';

// The design system's, Carnet's (its collections and links show in pages) and Pages' English.
addPagesEnglish();

AppRegistry.registerComponent(appName, () => App);
