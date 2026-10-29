/**
 * A note's colour and paper, as the phone's sheet lays them out (NoteColorSheet): the pigments'
 * washes and "Sans couleur", then the gradients, then the papers, every swatch the same round
 * pebble painted as the note will be (a paper over the note's own colour). Each group is a grid
 * that fills the picker's width in full rows; the colour's name, which its pebble does not carry,
 * stands at the end of its heading. The chosen colour takes a ring of ink, the chosen finish one of
 * matcha, both the picker's leaf check. Radio groups: arrows move.
 */
import { memo, type CSSProperties } from 'react';

import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import {
  isLineColor,
  isNoteGradient,
  isRuledPattern,
  LINE_COLORS,
  LINE_COLOR_NAMES,
  NOTE_GRADIENTS,
  NOTE_GRADIENT_NAMES,
  NOTE_PATTERNS,
  NOTE_PATTERN_NAMES,
  type LineColor,
  type NoteColor,
  type NoteGradient,
  type NotePattern,
} from '@unlease/design/colors';

import { Icon } from '../../components/Icon';
import { PebbleEdge } from '../../components/Outline';
import styles from './finishPicker.module.css';
import { arrowKeys } from './radioKeys';

/** A swatch's ruled lines sit closer than a note's: three or four rules across the pebble. */
const SWATCH_RULE = { '--pitch': '12px', backgroundPosition: '0 4px' } as CSSProperties;

/** The picker's check: a leaf-matcha pebble on the chosen swatch. */
function Check() {
  return (
    <span className={styles.check} data-pebble={2}>
      <Icon name="check" size={14} />
    </span>
  );
}

const COLORS: readonly (LineColor | null)[] = [null, ...LINE_COLORS];
const PAPERS: readonly (NotePattern | null)[] = [null, ...NOTE_PATTERNS];

function Heading({ title, chosen }: { title: string; chosen?: string }) {
  return (
    <div className={styles.heading}>
      <h3 className="t-meta-strong">{title}</h3>
      {chosen ? <span className={`${styles.chosenName} t-meta`}>{chosen}</span> : null}
    </div>
  );
}

function NoteFinishPickerComponent({ color, pattern, onColor, onPattern }: { color: NoteColor | null; pattern: NotePattern | null; onColor: (color: NoteColor | null) => void; onPattern: (pattern: NotePattern | null) => void }) {
  // A note wears a pigment, a gradient or neither: at most one swatch of the two groups is chosen.
  const pigment: LineColor | null = isLineColor(color) ? color : null;
  const gradient: NoteGradient | null = isNoteGradient(color) ? color : null;
  const onColorKeys = arrowKeys(COLORS, pigment, onColor, option => option ?? 'none');
  const onGradientKeys = arrowKeys<NoteGradient | null>(NOTE_GRADIENTS, gradient, next => next && onColor(next), option => option ?? '');
  const onPaperKeys = arrowKeys(PAPERS, pattern, onPattern, option => option ?? 'plain');
  const focusableGradient = gradient ?? NOTE_GRADIENTS[0];
  return (
    <div className={styles.finishes}>
      <section className={styles.group}>
        <Heading title={t('Couleur')} chosen={gradient ? undefined : pigment ? LINE_COLOR_NAMES[pigment] : t('Sans couleur')} />
        <div className={`${styles.grid} ${styles.colors}`} role="radiogroup" aria-label={t('Couleur de la note')} onKeyDown={onColorKeys}>
          {COLORS.map((key, index) => {
            const chosen = gradient === null && key === pigment;
            const name = key ? LINE_COLOR_NAMES[key] : t('Sans couleur');
            return (
              <button
                key={key ?? 'none'}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={name}
                data-tip={name}
                data-key={key ?? 'none'}
                data-line={key ?? undefined}
                tabIndex={key === pigment ? 0 : -1}
                className={key ? styles.pebble : `${styles.pebble} ${styles.none}`}
                // "Sans couleur" takes the first pebble, as on the phone, so neighbours never match.
                data-pebble-under={pebbleTurn(index)}
                data-still
                onClick={() => onColor(key)}
              >
                <PebbleEdge turn={pebbleTurn(index)} />
                {chosen ? <Check /> : key ? null : <span className={styles.slash} />}
              </button>
            );
          })}
        </div>
      </section>
      <section className={styles.group}>
        <Heading title={t('Dégradés')} />
        <div className={`${styles.grid} ${styles.finishGrid}`} role="radiogroup" aria-label={t('Dégradé de la note')} onKeyDown={onGradientKeys}>
          {NOTE_GRADIENTS.map((key, index) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={key === gradient}
              data-key={key}
              tabIndex={key === focusableGradient ? 0 : -1}
              className={styles.option}
              onClick={() => onColor(key)}
            >
              <span className={`${styles.swatch} paper`} data-gradient={key} data-pebble={pebbleTurn(index)} data-still>
                <PebbleEdge turn={pebbleTurn(index)} />
                {key === gradient ? <Check /> : null}
              </span>
              <span className={`${styles.name} t-label-small`}>{NOTE_GRADIENT_NAMES[key]}</span>
            </button>
          ))}
        </div>
      </section>
      <section className={styles.group}>
        <Heading title={t('Papier')} />
        <div className={`${styles.grid} ${styles.finishGrid}`} role="radiogroup" aria-label={t('Papier de la note')} onKeyDown={onPaperKeys}>
          {PAPERS.map((key, index) => (
            <button
              key={key ?? 'plain'}
              type="button"
              role="radio"
              aria-checked={key === pattern}
              data-key={key ?? 'plain'}
              tabIndex={key === pattern ? 0 : -1}
              className={styles.option}
              onClick={() => onPattern(key)}
            >
              {/* The paper on the note's own colour, so the swatch shows the sheet it makes. */}
              <span className={`${styles.swatch} paper`} data-line={pigment ?? undefined} data-gradient={gradient ?? undefined} data-pebble={pebbleTurn(index + 1)} data-still>
                {key ? <span className={styles.paperLayer} data-pattern={key} style={isRuledPattern(key) ? SWATCH_RULE : undefined} /> : null}
                <PebbleEdge turn={pebbleTurn(index + 1)} />
                {key === pattern ? <Check /> : null}
              </span>
              <span className={`${styles.name} t-label-small`}>{key ? NOTE_PATTERN_NAMES[key] : t('Uni')}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export const NoteFinishPicker = memo(NoteFinishPickerComponent);
