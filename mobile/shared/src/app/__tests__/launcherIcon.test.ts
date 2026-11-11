/**
 * The launcher's icon, through a stand-in for the native module: it follows the app's primary (its
 * palette's, or the nearest palette's), switched only once the app has left the screen and only when
 * the palette changes; a build without entries is left alone.
 */
import { AppState } from 'react-native';

import { DEFAULT_APPEARANCE, PALETTE_COLORS } from '@unlease/design/appearance';

import { state as native, __reset } from '../../../__mocks__/NativeLauncherIcon';
import { launchActivity } from '../../platform/launcherIcon';
import { closeDatabase, openDatabase } from '../../data/db/database';
import { setAppearance, useSettingsStore } from '../store/settingsStore';
import { applyLauncherIcon, onLauncherIconSwitch, startLauncherIcon, stopLauncherIcon } from '../launcherIcon';

let listeners: ((state: string) => void)[] = [];

beforeEach(() => {
  __reset();
  closeDatabase();
  openDatabase({ name: 'launcher.sqlite' });
  useSettingsStore.setState({ appearance: DEFAULT_APPEARANCE });
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  stopLauncherIcon();
  jest.restoreAllMocks();
});

const leave = (): void => listeners.forEach(listener => listener('background'));
const comeBack = (): void => listeners.forEach(listener => listener('active'));

describe('the launcher’s icon', () => {
  it('switches nothing at start, nor while the app is shown', () => {
    startLauncherIcon();
    expect(native.switched).toEqual([]);
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle });
    comeBack();
    expect(native.switched).toEqual([]);
  });

  it('follows the primary once the app has left the screen, and only when its palette changes', () => {
    startLauncherIcon();
    leave();
    expect(native.switched).toEqual([]);
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle });
    leave();
    expect(native.on).toBe('sarcelle');
    leave();
    // A primary picked precisely: the nearest palette's icon, here still Sarcelle's.
    setAppearance({ ...DEFAULT_APPEARANCE, primary: '#5FB0A6' });
    leave();
    expect(native.switched).toEqual(['sarcelle']);
    setAppearance(DEFAULT_APPEARANCE);
    leave();
    expect(native.switched).toEqual(['sarcelle', 'carnet']);
  });

  it('waits, under a picker or a dialog, for the next time the app is left', () => {
    startLauncherIcon();
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.mimosa });
    native.busy = true;
    leave();
    expect(native.on).toBe('carnet');
    native.busy = false;
    comeBack();
    leave();
    expect(native.switched).toEqual(['mimosa']);
  });

  it('takes the one on as it finds it', () => {
    native.on = 'pivoine';
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.pivoine });
    applyLauncherIcon();
    expect(native.switched).toEqual([]);
  });

  it('tells what follows the entry on (the app\'s dynamic shortcuts) after each switch, and only then', () => {
    const heard = jest.fn();
    const stop = onLauncherIconSwitch(heard);
    applyLauncherIcon();
    expect(heard).not.toHaveBeenCalled();
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.glycine });
    native.busy = true;
    applyLauncherIcon();
    expect(heard).not.toHaveBeenCalled();
    native.busy = false;
    applyLauncherIcon();
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    setAppearance(DEFAULT_APPEARANCE);
    applyLauncherIcon();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('leaves a build without entries alone', () => {
    native.palettes = [];
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle });
    applyLauncherIcon();
    expect(native.switched).toEqual([]);
  });
});

describe('a notification’s tap', () => {
  it('opens MainActivity by its class, never the launcher’s entry', () => {
    expect(launchActivity()).toBe('com.stephenprn.unlease.MainActivity');
  });
});
