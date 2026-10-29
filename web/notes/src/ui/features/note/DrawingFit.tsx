/**
 * A drawing note's strokes shown elsewhere (a page's embed, the spotlight's preview): the width they
 * are given, as tall as the drawing is (cut at a card's tallest, and at `max`), its top when longer.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { MAX_DRAWING_RATIO } from '@unlease/notes/services/wall';

import { DrawingPreview } from '../drawing/DrawingPreview';
import styles from './noteLines.module.css';

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function DrawingFit({ data, ratio, max }: { data: string; ratio: number; max: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const height = Math.round(Math.min(max, width * Math.min(ratio, MAX_DRAWING_RATIO)));
  return (
    <div ref={box} className={styles.drawing}>
      {width > 0 ? <DrawingPreview data={data} height={height} /> : null}
    </div>
  );
}
