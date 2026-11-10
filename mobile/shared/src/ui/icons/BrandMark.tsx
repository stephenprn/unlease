/**
 * An app's mark as the app draws it: its beige shape on the pebble in the primary colour
 * (`markColors`), what it holds cut out of it: Carnet's card and its leaf, Pages' sheet and its
 * writing, Contacts' card and its person (`@unlease/design/mark`).
 */
import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';

import type { AppId } from '@unlease/core/apps';
import { markColors } from '@unlease/design/appearance';
import { MARK_CALENDAR, MARK_CARD, MARK_CONTACT, MARK_PAGE, MARK_PEBBLE, MARK_VIEWBOX } from '@unlease/design/mark';
import { useSettingsStore } from '@shared/app/store/settingsStore';

/** Each app's shape on the pebble; an app without its own yet wears Carnet's card. */
const SHAPES: Partial<Record<AppId, string>> = { notes: MARK_CARD, pages: MARK_PAGE, calendar: MARK_CALENDAR, contacts: MARK_CONTACT };

function BrandMarkComponent({ app = 'notes', size = 32 }: { app?: AppId; size?: number }) {
  const { tile, card } = markColors(useSettingsStore(state => state.appearance.primary));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={MARK_PEBBLE} fill={tile} />
      <Path d={SHAPES[app] ?? MARK_CARD} fill={card} fillRule="evenodd" />
    </Svg>
  );
}

export const BrandMark = memo(BrandMarkComponent);
