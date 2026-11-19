/**
 * Réglages' « Sous la barre de recherche », as a choice among a few is laid out (a field showing the
 * value, its choices dropped from it; the phone's sheet): the row the board shows, with what that row
 * holds under it; pressed, its three rows, each a miniature of the board's top with it (the search
 * strip, then collections on their stones, labels' tags, or the filters with the first chosen), its
 * name and its line, the current one ticked. A press applies and closes.
 */
import { useId, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { BOARD_ROW_HINTS, BOARD_ROW_NAMES, BOARD_ROWS, type BoardRow } from '@unlease/notes/services/boardFilter';

import { setBoardRow, useBoardRow } from '../../../app/store/prefs';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import styles from './boardRow.module.css';

/** The miniature's pigments: three collections, three labels, as anyone's board might hold. */
const PIGMENTS: readonly LineColor[] = ['orange', 'blue', 'green'];

const bar = (width: number) => <span className={styles.bar} style={{ width }} />;

/** The board's top with `row` under its search strip, in the theme's colours: a picture, read with the name beside it. */
function Miniature({ row }: { row: BoardRow }) {
  return (
    <span className={styles.mini} aria-hidden="true">
      <span className={styles.strip} />
      <span className={styles.chips}>
        {row === 'filters'
          ? [0, 1, 2, 3].map(index => (
              <span key={index} className={`${styles.chip} ${styles.filter}`} data-chosen={index === 0 || undefined}>
                {bar(index === 0 ? 8 : 10)}
              </span>
            ))
          : PIGMENTS.map(pigment => (
              <span key={pigment} className={styles.chip}>
                {row === 'collections' ? <span className={styles.stone} data-line={pigment} data-pebble={1} data-still /> : <LabelTag color={pigment} size={7} />}
                {bar(10)}
              </span>
            ))}
      </span>
      <span className={styles.cards}>
        {[18, 14].map(width => (
          <span key={width} className={styles.card}>
            {bar(width)}
            {bar(22)}
          </span>
        ))}
      </span>
    </span>
  );
}

export function BoardRowChoice() {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const chosenRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const row = useBoardRow();
  const label = t('Under the search bar');
  return (
    <div className={controls.field}>
      <label htmlFor={id} className={`${controls.fieldLabel} t-meta-strong`}>
        {label}
      </label>
      <button ref={anchor} id={id} type="button" className={`${controls.input} ${controls.select}`} aria-haspopup="dialog" aria-expanded={open} aria-describedby={`${id}-note`} onClick={() => setOpen(true)}>
        <span className={controls.selectValue}>{t(BOARD_ROW_NAMES[row])}</span>
        <Icon name="chevronDown" size={18} className={controls.selectIcon} />
      </button>
      <p id={`${id}-note`} className={`${controls.help} ${controls.fieldNoteAlone} t-meta`}>
        {t(BOARD_ROW_HINTS[row])}
      </p>
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={label} align="start" rows initialFocus={chosenRef}>
        <div role="radiogroup" aria-label={label} className={styles.options}>
          {BOARD_ROWS.map(each => (
            <button
              key={each}
              ref={each === row ? chosenRef : undefined}
              type="button"
              role="radio"
              aria-checked={each === row}
              className={styles.option}
              onClick={() => {
                setOpen(false);
                if (each !== row) setBoardRow(each);
              }}
            >
              <Miniature row={each} />
              <span className={styles.words}>
                <span className="t-body-strong">{t(BOARD_ROW_NAMES[each])}</span>
                <span className={`${styles.hint} t-meta`}>{t(BOARD_ROW_HINTS[each])}</span>
              </span>
              <span className={styles.mark} aria-hidden="true">
                {each === row ? <Icon name="check" size={22} /> : null}
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}
