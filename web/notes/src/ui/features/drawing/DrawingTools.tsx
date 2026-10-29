/**
 * What a drawing is made with, in one strip: the pen, the marker, the highlighter and the eraser
 * (the one in hand on its filled pebble), the three sizes as dots of the tool's widths, the inks as
 * pebbles of the ink itself (the chosen one ringed in ink), then undo, redo and « Tout effacer ».
 * One row from 720px under a mouse; under a finger or on a phone-sized window two, the tools and the
 * actions over the sizes and inks, which scroll sideways when they run past the edge.
 */
import { useRef, type CSSProperties, type Ref } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t, tc } from '@unlease/core/i18n';
import { DRAWING_INKS, DRAWING_SIZES, DRAWING_SIZE_NAMES, DRAWING_TOOL_NAMES, type DrawingInk } from '@unlease/notes/models/drawing';

import controls from '../../components/controls.module.css';
import { IconButton } from '../../components/IconButton';
import { PebbleEdge } from '../../components/Outline';
import { isApple } from '../../dom';
import { arrowKeys } from '../note/radioKeys';
import { useHiddenSides } from '../pages/TableBlock';
import styles from './drawing.module.css';
import { chooseInk, chooseMode, chooseSize, DRAWING_MODES, usePen, type DrawingMode } from './pen';
import { inkName, sizeDot } from './strokes';

const MODE_ICONS: Readonly<Record<DrawingMode, GlyphName>> = { pen: 'pen', marker: 'marker', highlighter: 'highlight', eraser: 'eraser' };

export interface DrawingToolsProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canClear: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClear: () => void;
  /** The button of the tool in hand (a dialog's first focus). */
  readonly chosenRef?: Ref<HTMLButtonElement>;
  readonly className?: string;
}

export function DrawingTools({ canUndo, canRedo, canClear, onUndo, onRedo, onClear, chosenRef, className }: DrawingToolsProps) {
  const { mode, tool, sizes, ink } = usePen();
  const palette = useRef<HTMLDivElement>(null);
  useHiddenSides(palette);
  const apple = isApple();
  return (
    <div className={className ? `${styles.tools} ${className}` : styles.tools} role="toolbar" aria-label={t('Outils de dessin')}>
      <div className={styles.modes}>
        {DRAWING_MODES.map((each, index) => (
          <IconButton key={each} ref={each === mode ? chosenRef : undefined} icon={MODE_ICONS[each]} label={DRAWING_TOOL_NAMES[each]} pressed={each === mode} shape={index} className={styles.tool} onClick={() => chooseMode(each)} />
        ))}
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <div ref={palette} className={styles.palette}>
        <div className={styles.sizes} role="group" aria-label={t('Épaisseur')}>
          {DRAWING_SIZES.map(size => {
            const name = t(DRAWING_SIZE_NAMES[size]);
            return (
              <button
                key={size}
                type="button"
                className={`${controls.iconButton} ${styles.size}`}
                data-pebble-under={pebbleTurn(size)}
                aria-pressed={size === sizes[tool]}
                aria-label={name}
                data-tip={name}
                onClick={() => chooseSize(size)}
              >
                <span className={styles.dot} data-dot="" style={{ '--dot': `${sizeDot(tool, size)}px` } as CSSProperties} />
              </button>
            );
          })}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.inks} role="radiogroup" aria-label={t('Couleur du trait')} onKeyDown={arrowKeys<DrawingInk>(DRAWING_INKS, ink, chooseInk, key => key)}>
          {DRAWING_INKS.map((key, index) => {
            const name = inkName(key);
            return (
              <button key={key} type="button" role="radio" aria-checked={key === ink} aria-label={name} data-tip={name} data-key={key} tabIndex={key === ink ? 0 : -1} className={styles.ink} onClick={() => chooseInk(key)}>
                <span className={styles.inkRing} aria-hidden="true">
                  <PebbleEdge turn={pebbleTurn(index)} />
                </span>
                <span className={styles.inkPaint} data-line={key === 'ink' ? undefined : key} data-pebble={pebbleTurn(index)} data-still="" aria-hidden="true">
                  <PebbleEdge turn={pebbleTurn(index)} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.actions}>
        <IconButton icon="undo" label={tc('undo', 'Annuler')} shortcut={apple ? '⌘Z' : 'Ctrl+Z'} disabled={!canUndo} className={styles.tool} onClick={onUndo} />
        {/* Redo is undo's glyph, mirrored, as the pages' bar draws it. */}
        <IconButton icon="undo" label={t('Rétablir')} shortcut={apple ? '⇧⌘Z' : `Ctrl+${t('Maj')}+Z`} disabled={!canRedo} shape={1} className={`${styles.tool} ${styles.redo}`} onClick={onRedo} />
        <IconButton icon="trash" label={t('Tout effacer')} disabled={!canClear} shape={2} className={styles.tool} onClick={onClear} />
      </div>
    </div>
  );
}
