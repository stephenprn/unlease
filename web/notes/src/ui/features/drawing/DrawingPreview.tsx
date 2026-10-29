/**
 * A drawing as a card shows it: its strokes at the full width of what holds it, its top when it is
 * taller than `height`. No paper of its own (it lies on the card's wash and paper), nothing to press.
 */
import { memo } from 'react';

import styles from './drawing.module.css';
import { DrawingArt } from './StrokeArt';
import { strokesOf } from './strokes';

function DrawingPreviewComponent({ data, height }: { data: string; height: number }) {
  return (
    <div className={styles.preview} style={{ height }} aria-hidden="true">
      <DrawingArt strokes={strokesOf(data)} />
    </div>
  );
}

export const DrawingPreview = memo(DrawingPreviewComponent);
