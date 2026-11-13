/**
 * « Fond »: what a page's drawing lies on, from its tools (a drawing note's is the note's colour). The
 * button is the palette's glyph on a pebble of the background itself (the paper, a pigment's wash,
 * or nothing); it opens the backgrounds as the note's colours are laid out (NoteFinishPicker):
 * « Sans fond » struck through, the plain paper (the default), then the fourteen washes, each edged
 * in its pigment, in fours. The chosen one takes the ring of ink and the leaf check. A radio group: arrows move the
 * choice.
 */
import { memo, useRef, useState } from 'react';

import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import { isLineColor } from '@unlease/design/colors';
import { DRAWING_BACKGROUNDS, DRAWING_NONE, DRAWING_PAPER, drawingBackgroundName, type DrawingBackground } from '@unlease/notes/models/drawing';

import { Icon } from '@shared/ui/components/Icon';
import { PebbleEdge } from '@shared/ui/components/Outline';
import { Popover } from '@shared/ui/components/Popover';
import { arrowKeys } from '@shared/ui/components/radioKeys';
import controls from '@shared/ui/components/controls.module.css';
import finish from '../note/finishPicker.module.css';
import styles from './drawing.module.css';

export interface DrawingBackgroundChoice {
  /** The background worn (the paper until another is chosen, `drawingBackgroundOf`). */
  readonly value: DrawingBackground;
  readonly onChange: (background: DrawingBackground) => void;
}

/** The attributes that paint a sheet as `background`: `data-line` for a pigment's wash, `data-sheet` for any background. */
export function backgroundPaint(background: DrawingBackground): { readonly 'data-sheet'?: string; readonly 'data-line'?: string } {
  if (background === DRAWING_NONE) return {};
  return isLineColor(background) ? { 'data-sheet': '', 'data-line': background } : { 'data-sheet': '' };
}

function Check() {
  return (
    <span className={finish.check} data-pebble={2}>
      <Icon name="check" size={14} />
    </span>
  );
}

const keyOf = (option: DrawingBackground): string => option;

const BackgroundGrid = memo(function BackgroundGrid({ value, onChange }: DrawingBackgroundChoice) {
  const options = DRAWING_BACKGROUNDS;
  const focusable = options.includes(value) ? value : DRAWING_PAPER;
  const onKeys = arrowKeys(options, focusable, onChange, keyOf);
  const shown = drawingBackgroundName(value);
  // Sixteen in fours: each row starts a turn on, so a pebble never matches the one above it.
  const turnOf = (index: number): number => pebbleTurn(index + Math.floor(index / 4));
  return (
    <div className={finish.finishes}>
      <section className={finish.group}>
        <div className={finish.heading}>
          <h2 className="t-meta-strong">{t('Background')}</h2>
          <span className={`${finish.chosenName} t-meta`}>{shown}</span>
        </div>
        <div className={`${finish.grid} ${finish.colors} ${styles.backgroundFours}`} role="radiogroup" aria-label={t('Drawing background')} onKeyDown={onKeys}>
          {options.map((option, index) => {
            const chosen = option === value;
            const name = drawingBackgroundName(option);
            const plain = option === DRAWING_NONE || option === DRAWING_PAPER;
            return (
              <button
                key={keyOf(option)}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={name}
                data-tip={name}
                data-key={keyOf(option)}
                data-line={isLineColor(option) ? option : undefined}
                data-none={option === DRAWING_NONE || undefined}
                tabIndex={option === focusable ? 0 : -1}
                className={plain ? `${finish.pebble} ${finish.none} ${styles.backgroundSwatch}` : finish.pebble}
                data-pebble-under={turnOf(index)}
                data-still
                onClick={() => onChange(option)}
              >
                <PebbleEdge turn={turnOf(index)} />
                {chosen ? <Check /> : option === DRAWING_NONE ? <span className={finish.slash} /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
});

/** The « Fond » button and its picker, at the head of the tools' palette. */
export function DrawingBackgroundButton({ value, onChange }: DrawingBackgroundChoice) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = t('Background: {name}', { name: drawingBackgroundName(value) });
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={`${controls.iconButton} ${styles.tool} ${styles.backgroundButton}`}
        {...backgroundPaint(value)}
        data-pebble-under={pebbleTurn(3)}
        data-still
        aria-label={label}
        data-tip={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PebbleEdge turn={pebbleTurn(3)} />
        <Icon name="palette" size={22} />
      </button>
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={t('Drawing background')} width={300}>
        <div className={styles.backgroundPicker}>
          <BackgroundGrid value={value} onChange={onChange} />
        </div>
      </Popover>
    </>
  );
}
