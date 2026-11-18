/**
 * The time, again at each step while `active`: a few times a second for a countdown (so a second
 * turns when it has gone, whenever the timer started), each other frame for the stopwatch's
 * hundredths. Inactive, it holds still and costs nothing; a tab coming back to the front catches up
 * at once.
 */
import { useEffect, useState } from 'react';

/** Each `step` ms while `active`; else the time as it was. */
export function useTick(step: number, active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    // At once (a timer just started reads its whole length), then at each step.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), step);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [step, active]);
  return now;
}

/** Each other frame while `active` (about 30 a second: hundredths read as a blur either way); else still. */
export function useFrameTime(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // Still, the stopwatch reads what it banked: the time is not needed.
    if (!active) return undefined;
    let frame = 0;
    let odd = false;
    const run = (): void => {
      odd = !odd;
      if (odd) setNow(Date.now());
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return now;
}
