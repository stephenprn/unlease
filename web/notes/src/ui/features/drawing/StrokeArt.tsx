/**
 * Strokes as SVG paths in drawing units, in the order they lie: the writing ink or a pigment's
 * (`data-line`), the highlighter see-through. Each path is drawn once and kept while its stroke is.
 */
import { memo } from 'react';

import { DRAWING_WIDTH, HIGHLIGHTER_OPACITY, type Stroke } from '@unlease/notes/models/drawing';
import { drawingHeight, strokeWidth } from '@unlease/notes/services/drawing';

import styles from './drawing.module.css';
import { pathOf } from './strokes';

const StrokePath = memo(function StrokePath({ stroke }: { stroke: Stroke }) {
  return <path d={pathOf(stroke)} strokeWidth={strokeWidth(stroke)} opacity={stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : undefined} data-line={stroke.ink === 'ink' ? undefined : stroke.ink} />;
});

/** The strokes, those an eraser is going over left out. Inside a `strokes` group. */
export const StrokeList = memo(function StrokeList({ strokes, hidden = null }: { strokes: readonly Stroke[]; hidden?: ReadonlySet<string> | null }) {
  return <>{strokes.map(stroke => (hidden?.has(stroke.id) ? null : <StrokePath key={stroke.id} stroke={stroke} />))}</>;
});

/** A drawing at its container's width and its own proportions (`drawingHeight`); nothing to press. */
export const DrawingArt = memo(function DrawingArt({ strokes, className }: { strokes: readonly Stroke[]; className?: string }) {
  return (
    <svg className={className ? `${styles.art} ${className}` : styles.art} viewBox={`0 0 ${DRAWING_WIDTH} ${drawingHeight(strokes)}`} aria-hidden="true" focusable="false">
      <g className={styles.strokes}>
        <StrokeList strokes={strokes} />
      </g>
    </svg>
  );
});
