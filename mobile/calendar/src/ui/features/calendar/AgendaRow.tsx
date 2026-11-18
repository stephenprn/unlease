/**
 * One thing of a day on the Planning's panel, as « Ma journée » draws its rows (`ListRow`'s geometry):
 * its calendar's stone or its layer's glyph in the 24 slot, its title over its time and place, and an
 * event's place a map can find, « Y aller » at its end while it is not over (`DirectionsButton`). What
 * is over lies back (its mark at 0.55, its words in the second ink); what runs now reads a weight up.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import type { AgendaItem } from '@app/agenda';

import { AppText, Tappable, usePanelRowCorners, type RowPlace } from '@shared/ui/components';
import { listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DirectionsButton, directionsAction, rowDirections } from './DirectionsButton';
import { ItemMark } from './ItemMark';
import { itemTime, itemTitle } from './paint';

export interface AgendaRowProps {
  readonly item: AgendaItem;
  readonly day: string;
  readonly twelveHours: boolean;
  /** It has ended (`itemOver`): it lies back. */
  readonly over?: boolean;
  /** It runs now (`itemUnderWay`): its title a weight up. */
  readonly now?: boolean;
  /** Where it lies on its day's panel: the first's and the last's press follows the panel's corners. */
  readonly place?: RowPlace | null;
  readonly onOpen: (item: AgendaItem) => void;
}

function AgendaRowComponent({ item, day, twelveHours, over = false, now = false, place, onOpen }: AgendaRowProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const shape = usePanelRowCorners(place);
  const title = itemTitle(item);
  const time = itemTime(item, day, twelveHours);
  const placeName = item.kind === 'event' ? item.occurrence.event.place.trim() : '';
  const directions = rowDirections(item, over);
  return (
    // In a scrolling list: its tint once the touch is clearly a tap.
    <Tappable
      unstable_pressDelay={listPressDelay}
      onPress={() => onOpen(item)}
      style={[styles.row, shape]}
      accessibilityRole="button"
      accessibilityLabel={[title, time, placeName].filter(Boolean).join(', ')}
      {...directionsAction(directions)}
    >
      <View style={[styles.slot, over ? styles.over : null]}>
        <ItemMark item={item} />
      </View>
      <View style={styles.words}>
        <AppText variant={now ? 'bodyStrong' : 'body'} color={over ? theme.color.inkMuted : undefined} numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {placeName ? `${time} · ${placeName}` : time}
        </AppText>
      </View>
      {directions ? <DirectionsButton place={directions} /> : null}
    </Tappable>
  );
}

export const AgendaRow = memo(AgendaRowComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    // `ListRow`'s geometry, as « Ma journée »'s rows: 6 in, 10 to the mark (16 from the panel's edge), the words 16 after its 24 slot, half the rows' gap above and below.
    row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    slot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    // What is over lies back, as « Ma journée »'s rows.
    over: { opacity: 0.55 },
    words: { flex: 1, gap: 2 },
  });
