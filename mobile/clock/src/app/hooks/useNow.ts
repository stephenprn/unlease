import { useEffect, useState } from 'react';

/** The time now, kept fresh every few seconds: « Sonnera dans 9 h 12 » counts down as the screen stays open. */
export function useNow(every = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
