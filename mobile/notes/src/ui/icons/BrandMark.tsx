/** The mark as the app draws it: the beige card on its pebble in the primary colour (`markColors`), the leaf cut out of the card. */
import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { markColors } from '@unlease/design/appearance';
import { MARK_CARD, MARK_PEBBLE, MARK_VIEWBOX } from '@unlease/design/mark';
import { useSettingsStore } from '@app/store/settingsStore';

function BrandMarkComponent({ size = 32 }: { size?: number }) {
  const { tile, card } = markColors(useSettingsStore(state => state.appearance.primary));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={MARK_PEBBLE} fill={tile} />
      <Path d={MARK_CARD} fill={card} fillRule="evenodd" />
    </Svg>
  );
}

export const BrandMark = memo(BrandMarkComponent);
