/**
 * An icon button, as on the phone: a 24 glyph whose hover, press and chosen state lie on the brand's
 * pebble behind it (44, 48 under a finger), neighbours on different turns of it (`shape`); the
 * pebble gives under the press. Its label is both the accessible name and the tooltip (`data-tip`,
 * drawn by `Tooltip`), with the keyboard shortcut when it has one.
 */
import { forwardRef, memo, type MouseEvent } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';

import styles from './controls.module.css';
import { Icon } from './Icon';

export interface IconButtonProps {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** On the slip (snackbar, transfer): its own inks. */
  readonly onSlip?: boolean;
  readonly disabled?: boolean;
  /** A toggle's state (pin on): drawn in the tonal container and announced as pressed. */
  readonly pressed?: boolean;
  /** Drawn as chosen (an open bubble's pebble) without being a toggle: its state is said otherwise (`expanded`). */
  readonly selected?: boolean;
  /** Shown in the tooltip, e.g. "E". */
  readonly shortcut?: string;
  readonly size?: number;
  /** Which turn of the pebble (`pebbleTurn`): neighbours differ. */
  readonly shape?: number;
  readonly compact?: boolean;
  readonly className?: string;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly hasPopup?: 'menu' | 'dialog' | 'listbox';
  readonly tip?: boolean;
}

/** The pebble under a control drawn as an icon button without being one (a link styled `controls.iconButton`): spread it on the element. */
export function pebbleUnder(shape: number): { readonly 'data-pebble-under': number } {
  return { 'data-pebble-under': pebbleTurn(shape) };
}

const IconButtonComponent = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, onClick, onSlip, disabled, pressed, selected, shortcut, size = 24, shape = 0, compact, className, expanded, controls, hasPopup, tip = true },
  ref,
) {
  const classes = [styles.iconButton, onSlip ? styles.onSlip : '', compact ? styles.compact : '', selected ? styles.selected : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      data-pebble-under={pebbleTurn(shape)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-haspopup={hasPopup}
      data-tip={tip ? (shortcut ? `${label} (${shortcut})` : label) : undefined}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});

export const IconButton = memo(IconButtonComponent);
