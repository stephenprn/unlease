/**
 * What arrives in a period already on screen (an event made, brought back by « Annuler », moved
 * there, or synced in) settles in, as a card new to Carnet's wall does; a period shown whole (opened,
 * turned, filtered) and what scrolls into view simply are there.
 */
import { useMemo, useState } from 'react';
import { Keyframe } from 'react-native-reanimated';

import { decelerate } from '@shared/ui/theme/motion';

/** Carnet's card coming in: from 0.94, after a beat. */
export const ITEM_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(200).delay(120);

const NONE: ReadonlySet<string> = new Set();

/** The keys new since the last render of the same period (`period`: what is shown, its filter included). */
export function useArrivals(keys: readonly string[], period: string): ReadonlySet<string> {
  const signature = keys.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Set(keys), [signature]);
  const [seen, setSeen] = useState({ keys: now, period, arrived: NONE });
  if (seen.keys !== now || seen.period !== period) {
    const arrived = seen.period === period ? new Set([...now].filter(key => !seen.keys.has(key))) : NONE;
    setSeen({ keys: now, period, arrived });
    return arrived;
  }
  return seen.arrived;
}
