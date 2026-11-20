/**
 * False while a screen opens, true once it has been drawn: what nobody sees as it opens (the closed
 * drawer and its rows) is drawn then, so it is there before it is asked for without holding the
 * screen's first frame back.
 */
import { useEffect, useState } from 'react';

/** After the screen's own parts that follow its first draw (a wall's cards past the screen). */
const AFTER_MS = 300;

export function useAfterFirstDraw(): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDrawn(true), AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return drawn;
}
