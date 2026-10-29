/**
 * A colour of one's own for the primary, the accent or the ground: the app by day and at night as
 * it would be, a line saying whether the colour shows as picked or moved to stay readable, Carnet's
 * own colours to start from, then the picker. Nothing changes until "Choisir".
 */
import { useId, useState, type CSSProperties } from 'react';

import { COLOR_ROLE_WORDS, longestPickNote, pickAdjusted, pickNote, pickSuggestions, resolveAppearance, type Appearance, type PickNote, type PickTarget } from '@unlease/design/appearance';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';

import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import { PebbleEdge } from '../../components/Outline';
import { arrowKeys } from '../note/radioKeys';
import { AppearancePreview } from './AppearancePreview';
import styles from './appearance.module.css';
import { ColorPicker } from './ColorPicker';

export function colorTitle(target: PickTarget): string {
  return target === 'ground' ? t('Couleur du fond') : COLOR_ROLE_WORDS[target].title;
}

/** The appearance with `color` in the place `target` names. */
export function withColor(appearance: Appearance, target: PickTarget, color: string): Appearance {
  return target === 'ground' ? { ...appearance, ground: { kind: 'color', color } } : { ...appearance, [target]: color };
}

/**
 * What the colour does, under the preview. A hidden twin holding the longest line keeps the room in
 * the same cell, so the dialog never changes height as a drag crosses into a colour that moves.
 */
export function PickLine({ note }: { note: PickNote }) {
  return (
    <p className={`${styles.note} t-meta`} data-adjusted={note.adjusted || undefined}>
      <span className={styles.noteSizer} aria-hidden="true">
        <Icon name="info" size={16} />
        {longestPickNote()}
      </span>
      <span className={styles.noteText} aria-live="polite">
        <Icon name={note.adjusted ? 'info' : 'check'} size={16} />
        {note.text}
      </span>
    </p>
  );
}

/** Carnet's own colours to start from, as pebbles; the one the picker stands on is ringed in ink. */
export function PickSuggestions({ target, value, onPick }: { target: PickTarget; value: string; onPick: (color: string) => void }) {
  const suggestions = pickSuggestions(target);
  const colors = suggestions.map(each => each.color);
  const chosen = colors.find(color => color.toUpperCase() === value.toUpperCase()) ?? null;
  return (
    <div className={styles.suggestions} role="radiogroup" aria-label={t('Suggestions')} onKeyDown={arrowKeys(colors, chosen ?? colors[0]!, onPick, color => color)}>
      {suggestions.map(({ name, color }, index) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === chosen}
          aria-label={name}
          title={name}
          data-key={color}
          tabIndex={color === (chosen ?? colors[0]) ? 0 : -1}
          className={styles.suggestion}
          onClick={() => onPick(color)}
        >
          <span className={styles.suggestionPaint} data-pebble-under={pebbleTurn(index)} data-still style={{ '--pebble-fill': color } as CSSProperties}>
            <PebbleEdge turn={pebbleTurn(index)} />
          </span>
        </button>
      ))}
    </div>
  );
}

export function ColorDialog({ open, target, initial, appearance, onCancel, onChoose }: { open: boolean; target: PickTarget; initial: string; appearance: Appearance; onCancel: () => void; onChoose: (color: string) => void }) {
  const id = useId();
  const [color, setColor] = useState(initial);
  // Each opening starts again from the colour it is given.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setColor(initial);
  }
  const draft = withColor(appearance, target, color);
  const grounds = (mode: 'light' | 'dark'): readonly string[] => resolveAppearance(draft, mode).ground.colors;
  const note = pickNote(pickAdjusted(target, color, 'light', grounds('light')), pickAdjusted(target, color, 'dark', grounds('dark')));
  return (
    <Layer open={open} onDismiss={onCancel} labelledBy={`${id}-title`}>
      <DialogFrame
        title={colorTitle(target)}
        titleId={`${id}-title`}
        className={styles.editor}
        onClose={onCancel}
        onSubmit={event => {
          event.preventDefault();
          onChoose(color);
        }}
        foot={
          <>
            <Button kind="text" onClick={onCancel}>
              {t('Annuler')}
            </Button>
            <Button type="submit">{t('Choisir')}</Button>
          </>
        }
      >
        <AppearancePreview look={draft} className={styles.editorPreview} />
        <PickLine note={note} />
        <PickSuggestions target={target} value={color} onPick={setColor} />
        <ColorPicker value={color} onChange={setColor} label={colorTitle(target)} />
      </DialogFrame>
    </Layer>
  );
}
