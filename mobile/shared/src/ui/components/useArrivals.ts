/**
 * Which items of a list arrived while it was shown (a record made, brought back by « Annuler »,
 * synced in): those settle in (`listIn`), as a card new to Carnet's wall does. What is there when the
 * list opens, a list shown whole afresh (another view, another filter: another `scope`) and what
 * scrolls into view simply are there.
 */
import { useMemo, useState } from 'react';

const NONE: ReadonlySet<string> = new Set();

/** The keys new since the last render of the same `scope` (what is shown: the view, its filter, its period). */
export function useArrivals(keys: readonly string[], scope = ''): ReadonlySet<string> {
  const signature = keys.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Set(keys), [signature]);
  const [seen, setSeen] = useState({ keys: now, scope, arrived: NONE });
  if (seen.keys !== now || seen.scope !== scope) {
    const arrived = seen.scope === scope ? new Set([...now].filter(key => !seen.keys.has(key))) : NONE;
    setSeen({ keys: now, scope, arrived });
    return arrived;
  }
  return seen.arrived;
}
