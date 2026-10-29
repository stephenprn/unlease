/** The mark as the app draws it: the beige card on its pebble in the primary colour (`markColors`), the leaf cut out of the card. */
import { memo } from 'react';

import { markColors } from '@unlease/design/appearance';
import { MARK_CARD, MARK_PEBBLE, MARK_VIEWBOX } from '@unlease/design/mark';

import { useSettingsStore } from '../../app/store/settings';
import styles from './marks.module.css';

function BrandMarkComponent({ size = 32 }: { size?: number }) {
  const { tile, card } = markColors(useSettingsStore(state => state.appearance.primary));
  return (
    <svg className={styles.mark} width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} aria-hidden="true" focusable="false">
      <path d={MARK_PEBBLE} fill={tile} />
      <path d={MARK_CARD} fill={card} fillRule="evenodd" />
    </svg>
  );
}

export const BrandMark = memo(BrandMarkComponent);
