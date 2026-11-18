/**
 * The time, again at each step while `active`: each second for a countdown (on the second's edge, so
 * every timer turns together), each frame or two for the stopwatch's hundredths. Paused or hidden, it
 * holds still and costs nothing.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Each `step` ms while `active` (aligned on the step's edge); else the time as it was. */
export function useTick(step: number, active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      setNow(Date.now());
      timer = setTimeout(tick, step - (Date.now() % step) + 5);
    };
    timer = setTimeout(tick, step - (Date.now() % step) + 5);
    // Back in front: at once, not at the next step.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [step, active]);
  return now;
}

/** Each other frame while `active` (about 30 a second: hundredths read as a blur either way); else still. */
export function useFrameTime(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) {
      setNow(Date.now());
      return undefined;
    }
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
