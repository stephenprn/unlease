/** A media query as React state (false where matchMedia is missing, as in tests). */
import { useCallback, useSyncExternalStore } from 'react';

export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    [query],
  );
  const snapshot = useCallback(() => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches), [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** The phone layout: bottom bar, modal drawer, full-screen dialogs. */
export const NARROW = '(max-width: 719px)';

/** The navigation docked beside the page: its collections replace the board's chips. */
export const DOCKED = '(min-width: 1100px)';
