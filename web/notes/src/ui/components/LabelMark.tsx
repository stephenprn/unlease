/**
 * A label as a note wears it: a small hand-cut paper tag in the label's gouache
 * (`design/emblems`), its eyelet punched through, then its name. Small on
 * purpose: a card can wear four labels without becoming a row of pills.
 */
import { memo } from 'react';

import { LABEL_CHECK, LABEL_TAG_BOX, LABEL_TAG_EDGE, LABEL_TAG_EYELET, LABEL_TAG_PATH } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import styles from './marks.module.css';

const VIEWBOX = `0 0 ${LABEL_TAG_BOX.width} ${LABEL_TAG_BOX.height}`;

export function LabelTag({ color, size = 14 }: { color: LineColor; size?: number }) {
  return (
    <svg className={styles.tag} data-line={color} width={size} height={(size * LABEL_TAG_BOX.height) / LABEL_TAG_BOX.width} viewBox={VIEWBOX} aria-hidden="true" focusable="false">
      <path d={LABEL_TAG_PATH} fill="var(--fill)" fillRule="evenodd" />
    </svg>
  );
}

/**
 * The tag as a picker's checkbox, in the label's gouache: off, its edge and eyelet outlined; on, filled with the eyelet punched.
 * The edge is drawn in both states, so only the eyelet ring and the fill cross over (the outline never dims mid-fade).
 */
export function LabelCheck({ color, checked, size = 26 }: { color: LineColor; checked: boolean; size?: number }) {
  return (
    <svg className={styles.check} data-line={color} data-checked={checked || undefined} width={size} height={(size * LABEL_CHECK.height) / LABEL_CHECK.width} viewBox={LABEL_CHECK.viewBox} aria-hidden="true" focusable="false">
      <path className={styles.checkFill} d={LABEL_TAG_PATH} fillRule="evenodd" />
      <path className={styles.checkLine} d={LABEL_TAG_EDGE} strokeWidth={LABEL_CHECK.stroke} />
      <path className={`${styles.checkLine} ${styles.checkEyelet}`} d={LABEL_TAG_EYELET} strokeWidth={LABEL_CHECK.stroke} />
    </svg>
  );
}

function LabelMarkComponent({ name, color, className }: { name: string; color: LineColor; className?: string }) {
  return (
    <span className={[styles.label, className ?? ''].join(' ')}>
      <LabelTag color={color} />
      {name ? <span className={`${styles.labelName} t-meta`}>{name}</span> : null}
    </span>
  );
}

export const LabelMark = memo(LabelMarkComponent);
