/**
 * Whether another app of the suite can be opened from this one (a drawer's row to it): installed on
 * this phone (its scheme answers: every app's manifest names the suite's in `<queries>`), or run by
 * the server, whose web app then opens it (`openInApp`). `useInstalledApps`: installed only (those a
 * look can be sent to).
 */
import { useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { APPS, type AppId } from '@unlease/core/apps';

import { useSettingsStore } from '../store/settingsStore';

export function useAppReachable(app: AppId): boolean {
  return useReachableApps([app]).length > 0;
}

/** Those of `apps` this phone can open, in the order given. */
export function useReachableApps(apps: readonly AppId[]): readonly AppId[] {
  const key = apps.join(',');
  const served = useSettingsStore(state => (state.server !== null && state.apps !== null ? state.apps.join(',') : ''));
  const installed = useInstalledSet(key);
  return useMemo(() => {
    const runs = new Set(served ? served.split(',') : []);
    return (key ? (key.split(',') as AppId[]) : []).filter(app => installed.has(app) || runs.has(app));
  }, [key, served, installed]);
}

/** Those of `apps` installed on this phone, in the order given (none while their schemes are asked). */
export function useInstalledApps(apps: readonly AppId[]): readonly AppId[] {
  const key = apps.join(',');
  const installed = useInstalledSet(key);
  return useMemo(() => (key ? (key.split(',') as AppId[]) : []).filter(app => installed.has(app)), [key, installed]);
}

/** The apps of `key` (ids joined by commas) whose scheme answers. */
function useInstalledSet(key: string): ReadonlySet<AppId> {
  const [installed, setInstalled] = useState<ReadonlySet<AppId>>(() => new Set());
  useEffect(() => {
    let live = true;
    const asked = key ? (key.split(',') as AppId[]) : [];
    Promise.all(asked.map(app => Linking.canOpenURL(`${APPS[app].scheme}://`).then(answer => (answer ? app : null), () => null)))
      .then(answers => {
        if (live) setInstalled(new Set(answers.filter((app): app is AppId => app !== null)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return installed;
}
