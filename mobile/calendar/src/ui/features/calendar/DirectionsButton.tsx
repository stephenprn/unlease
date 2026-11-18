/**
 * « Y aller » at a list row's end (the Planning, « Ma journée »): the `directions` glyph in the second
 * ink, a 40 pebble in the row's 40 of content (its slop reaching 48), opening the way to the event's
 * place in the maps chosen, or the chooser (`openPlace`). Only for an event still to come or under way
 * whose place a map can find (`rowDirections`); the row, one control for TalkBack, carries the same as
 * an action (`directionsAction`).
 */
import React, { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { directionsTo } from '@unlease/calendar/services/links';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { later } from '@app/later';

import { openPlace } from '@shared/app/openPlace';
import { IconButton } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** Where a row's « Y aller » leads: an event's place a map can find, while it is not over; '' offers none. */
export function rowDirections(item: { readonly kind: string; readonly occurrence?: Occurrence }, over: boolean): string {
  return item.kind === 'event' && item.occurrence && !over ? directionsTo(item.occurrence.event.place) : '';
}

const goTo = (place: string): void => later(openPlace(place, { directions: true }));

/** The row's TalkBack action, beside the button its single control hides. */
export function directionsAction(place: string): {
  accessibilityActions?: { name: string; label: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
} {
  if (!place) return {};
  return {
    accessibilityActions: [{ name: 'directions', label: t('Directions to {name}', { name: place }) }],
    onAccessibilityAction: event => {
      if (event.nativeEvent.actionName === 'directions') goTo(place);
    },
  };
}

function DirectionsButtonComponent({ place }: { readonly place: string }) {
  const theme = useTheme();
  return <IconButton icon="directions" label={t('Directions to {name}', { name: place })} color={theme.color.inkMuted} shape={2} onPress={() => goTo(place)} style={ROW_END} />;
}

/** In the row's 40 of content (56 less its 8 above and below), 4 past its end padding: the glyph 14 from the row's edge, as a list row's trailing icon. */
const ROW_END = { marginVertical: 0, marginRight: -4 } as const;

export const DirectionsButton = memo(DirectionsButtonComponent);
