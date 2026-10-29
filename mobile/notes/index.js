/**
 * @format
 */

// Must be the first import: gesture-handler installs its root view manager before any tree.
import 'react-native-gesture-handler';

import notifee from '@notifee/react-native';
import { AppRegistry } from 'react-native';
import { addNotesEnglish } from '@unlease/notes/i18n';

import App from './App';
import { name as appName } from './app.json';
import { handleBackgroundEvent } from './src/app/backgroundEvents';
import { QuickProviders } from './src/app/providers/QuickProviders';
import { QUICK_WINDOW, WIDGET_TASK } from './src/app/widgets';
import { runWidgetTask } from './src/app/widgetTask';

// The design system's and Carnet's English, for every root below.
addNotesEnglish();

// Before registerComponent, as Notifee requires.
notifee.onBackgroundEvent(handleBackgroundEvent);

AppRegistry.registerComponent(appName, () => App);
// The quick window over the home screen, and a tick on a note widget written with the app closed.
AppRegistry.registerComponent(QUICK_WINDOW, () => QuickProviders);
AppRegistry.registerHeadlessTask(WIDGET_TASK, () => runWidgetTask);
