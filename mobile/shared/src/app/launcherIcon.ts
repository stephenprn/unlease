/**
 * The app's icon in the launcher follows its primary colour: Android shows one of the icons made
 * beforehand, one per palette (`launcherPalette`: the palette's own, or the nearest to a colour
 * picked precisely), each a launcher entry of its own.
 *
 * Switching closes the task the launcher opened through the entry turned off, and a launcher may
 * drop that entry from the home screen, so it is done only when the palette changes, and once the
 * app has left the screen (never while it is shown, never at start when nothing changed). Under a
 * picker, the camera or a permission's dialog the app is paused too: the module then declines, and
 * the switch waits for the next time the app is left.
 */
import { AppState, type NativeEventSubscription } from 'react-native';

import { launcherPalette } from '@unlease/design/appearance';
import { launcherIconOn, switchLauncherIcon } from '@shared/platform/launcherIcon';

import { useSettingsStore } from './store/settingsStore';

/** The palette whose entry is on, as last read or set (undefined until first asked; null: this build has none). */
let on: string | null | undefined;

/** The entry for this app's primary turned on, when another is. */
export function applyLauncherIcon(): void {
  if (on === undefined) on = launcherIconOn();
  if (on === null) return;
  const wanted = launcherPalette(useSettingsStore.getState().appearance.primary);
  if (wanted === on) return;
  if (switchLauncherIcon(wanted)) on = wanted;
}

let background: NativeEventSubscription | null = null;

/** From start (bootstrap): the launcher's icon follows the primary whenever the app leaves the screen. */
export function startLauncherIcon(): void {
  background ??= AppState.addEventListener('change', next => {
    if (next === 'background') applyLauncherIcon();
  });
}

/** Test seam. */
export function stopLauncherIcon(): void {
  background?.remove();
  background = null;
  on = undefined;
}
