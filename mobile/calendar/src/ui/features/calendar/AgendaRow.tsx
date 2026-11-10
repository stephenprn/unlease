/** One thing of a day in a list (the schedule, a day's sheet, the search): its colour, its title, its time and place. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import type { GlyphName } from '@unlease/design/glyphs';
import type { AgendaItem } from '@app/agenda';

import { AppText, Icon, Tappable } from '@shared/ui/components';
import { listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { itemColor, itemTime, itemTitle, paintOf } from './paint';

const GLYPHS: Readonly<Record<AgendaItem['kind'], GlyphName | null>> = { event: null, birthday: 'cake', reminder: 'bell', page: 'page' };

export const ROW_HEIGHT = 64;

function AgendaRowComponent({ item, day, twelveHours, onOpen }: { item: AgendaItem; day: string; twelveHours: boolean; onOpen: (item: AgendaItem) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const paint = paintOf(theme, itemColor(item));
  const title = itemTitle(item);
  const time = itemTime(item, day, twelveHours);
  const place = item.kind === 'event' ? item.occurrence.event.place.trim() : '';
  const glyph = GLYPHS[item.kind];
  return (
    // In a scrolling list: its tint once the touch is clearly a tap.
    <Tappable unstable_pressDelay={listPressDelay} onPress={() => onOpen(item)} style={styles.row} accessibilityRole="button" accessibilityLabel={`${title}, ${time}${place ? `, ${place}` : ''}`}>
      <View style={[styles.stripe, { backgroundColor: paint.fill }]} />
      <View style={styles.text}>
        <View style={styles.titleLine}>
          {glyph ? <Icon name={glyph} size={16} color={paint.text} /> : null}
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
        </View>
        <AppText variant="meta" numberOfLines={1}>
          {place ? `${time} · ${place}` : time}
        </AppText>
      </View>
    </Tappable>
  );
}

export const AgendaRow = memo(AgendaRowComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.color.paper, ...corners(SHAPES.tab) },
    stripe: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
    text: { flex: 1, gap: 2 },
    titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { flexShrink: 1 },
  });

