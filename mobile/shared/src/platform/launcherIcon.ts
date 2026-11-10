/**
 * The app's icon in the launcher, through the LauncherIcon TurboModule: which palette's launcher
 * entry is on, and another turned on. A build without the module (a test, an older native build)
 * has none: nothing is switched, and a notification opens the app the way it always did.
 */
import NativeLauncherIcon from '../../specs/NativeLauncherIcon';

/** The palette whose entry is on; null when this build has none (or not exactly one is on). */
export function launcherIconOn(): string | null {
  try {
    return NativeLauncherIcon?.current() || null;
  } catch {
    return null;
  }
}

/** Turns that palette's entry on and the others off; false when it could not, or not now (another activity waits in the app's task). */
export function switchLauncherIcon(palette: string): boolean {
  try {
    return NativeLauncherIcon?.choose(palette) ?? false;
  } catch {
    return false;
  }
}

let mainActivity: string | null = null;

/**
 * What a notification's tap opens (Notifee's `launchActivity`): MainActivity by its class. Notifee's
 * `'default'` asks Android for the launcher's activity, which is now an entry, not a class it can
 * load, and the tap would open nothing.
 */
export function launchActivity(): string {
  if (mainActivity === null) {
    try {
      mainActivity = NativeLauncherIcon?.mainActivity() ?? '';
    } catch {
      mainActivity = '';
    }
  }
  return mainActivity || 'default';
}
