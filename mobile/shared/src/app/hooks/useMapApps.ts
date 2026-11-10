/**
 * The phone's maps apps, for the chooser and Réglages: those found last at once, asked again each
 * time `active` turns on (one may have been installed since). The sheets' host asks at start, so a
 * sheet opens already full.
 */
import { useEffect, useState } from 'react';

import { mapApps, type MapAppInfo } from '@shared/platform/mapApps';

let known: readonly MapAppInfo[] | null = null;

export function useMapApps(active: boolean): readonly MapAppInfo[] | null {
  const [apps, setApps] = useState(known);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    if (known) setApps(known);
    mapApps().then(found => {
      known = found;
      if (live) setApps(found);
    });
    return () => {
      live = false;
    };
  }, [active]);
  return apps;
}
