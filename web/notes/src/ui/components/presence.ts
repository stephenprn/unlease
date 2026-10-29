/**
 * Leaving takes a moment: these keep a closing overlay drawn while it animates out, then let it go.
 * The exit's own `animationend` calls `done`; the timeout is the fallback (reduced motion, a hidden tab).
 */
import { useCallback, useEffect, useState } from 'react';

/** For something with an `open` flag: `closing` while it leaves, back at once if it reopens. Call `done` only from the exit's end. */
export function usePresence(open: boolean, ms: number): { readonly present: boolean; readonly closing: boolean; readonly done: () => void } {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const closing = !open && present;
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setPresent(false), ms);
    return () => clearTimeout(timer);
  }, [closing, ms]);
  const done = useCallback(() => setPresent(false), []);
  return { present: open || present, closing, done };
}

/** For something drawn from a value (a route's id): the last value stays, `leaving`, for `ms` after it goes. */
export function useLeaving<T>(value: T | null, ms: number): { readonly value: T | null; readonly leaving: boolean } {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  const leaving = value === null && last !== null;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLast(null), ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);
  return { value: value ?? last, leaving };
}
