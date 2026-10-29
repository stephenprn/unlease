/** A value stepped one notch at a time between two small buttons: servings, a season, an episode. */
import type { GlyphName } from '@unlease/design/glyphs';

import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import styles from './links.module.css';

export interface StepperProps {
  /** Names the group: « Pour N personnes », « Saison ». */
  readonly label: string;
  readonly value: string;
  readonly lessLabel: string;
  readonly moreLabel: string;
  readonly onLess?: () => void;
  readonly onMore?: () => void;
  /** In the module bar: as tall as its small buttons, on the tonal fill. */
  readonly inBar?: boolean;
  /** Beside the value, what it counts (the phone's): `people` for servings. */
  readonly icon?: GlyphName;
}

export function Stepper({ label, value, lessLabel, moreLabel, onLess, onMore, inBar, icon }: StepperProps) {
  return (
    <div role="group" aria-label={label} className={styles.stepper} data-bar={inBar || undefined}>
      <IconButton icon="minus" label={lessLabel} onClick={onLess} disabled={!onLess} compact={inBar} />
      <span className={`${styles.stepperValue} t-label tabular`} aria-live="polite">
        {icon ? <Icon name={icon} size={18} /> : null}
        {value}
      </span>
      <IconButton icon="plus" label={moreLabel} onClick={onMore} disabled={!onMore} compact={inBar} />
    </div>
  );
}
