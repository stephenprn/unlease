/**
 * What leads a row of a day in a list (« Ma journée », the Planning): an event's calendar stone in its
 * colour (the drawer's `FeedStone` a size down, to sit in the 24 slot), a layer's glyph in its pigment,
 * a page's emoji when it has one.
 */
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';

import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import type { DayItem } from '@unlease/calendar/services/today';
import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { AgendaItem } from '@app/agenda';

import { AppText, Icon, Organic } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const LAYER_GLYPHS: Readonly<Record<Exclude<DayItem['kind'], 'event'>, GlyphName>> = { birthday: 'cake', reminder: 'bell', page: 'page' };

function ItemMarkComponent({ item }: { readonly item: AgendaItem | DayItem }) {
  const theme = useTheme();
  if (item.kind === 'event') {
    return <Organic pebble={pebbleTurnOf(item.occurrence.event.feedId ?? 'own')} style={[styles.stone, { backgroundColor: item.color ? theme.line[item.color].fill : theme.color.action }]} />;
  }
  if (item.kind === 'page' && item.page.icon) return <AppText style={styles.emoji}>{item.page.icon}</AppText>;
  return <Icon name={LAYER_GLYPHS[item.kind]} size={20} color={theme.line[LAYER_COLORS[item.kind]].text} />;
}

export const ItemMark = memo(ItemMarkComponent);

const styles = StyleSheet.create({ emoji: { fontSize: 20, lineHeight: 24 }, stone: { width: 18, height: 16 } });
