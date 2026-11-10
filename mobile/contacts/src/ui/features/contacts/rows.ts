/**
 * Rows on a card, `ROW_INSET` in from its sides, top and foot, the rows' gap apart: a row's corners are a tab's, but the
 * first row's top corners and the last row's foot corners follow the card's own curve (concentric with
 * it, `design/shapes`), so a press there never cuts a tighter corner inside the card's.
 */
import type { ViewStyle } from 'react-native';

import { concentric, RADII } from '@unlease/design/shapes';

import { corners } from '@shared/ui/theme/shape';

export const ROW_INSET = 6;

const OUTER = concentric(RADII.card, ROW_INSET);

/** The corners of the row at `index` of `count` on a card. */
export function rowCorners(index: number, count: number): ViewStyle {
  const top = index === 0 ? OUTER : RADII.row;
  const foot = index === count - 1 ? OUTER : RADII.row;
  return corners([top, top, foot, foot]);
}
