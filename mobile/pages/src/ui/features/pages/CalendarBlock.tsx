/**
 * A calendar block (`calendar`): Agenda's next events, a label's or all of them, for 7, 14 or 30
 * days, grouped by day as a short schedule (`pages/services/calendarBlock`), each opening in Agenda
 * (its app when installed, else its web app). Its label and its days are chosen in its head; it
 * stores nothing else, so it shows the calendar as it is now. The web's `CalendarBlock`.
 */
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { CALENDAR_BLOCK_DAYS, type Block } from '@unlease/pages/models/blocks';
import { calendarBlockDays, calendarBlockLabel, calendarLabels } from '@unlease/pages/services/calendarBlock';
import { dayDistance, timeRange, weekdayDay } from '@unlease/calendar/services/eventText';
import { dayToInstant, instantToDay } from '@unlease/calendar/services/time';
import { updateBlock } from '@app/store/pages';
import { useLibraryStore } from '@app/store/libraryStore';
import { eventPlace, openInApp } from '@shared/app/openApp';

import { AppText, EmptyLine, Icon, LabelTag, ListRow, Organic, Segmented, Sheet, SheetScroll, Tappable } from '@shared/ui/components';
import { listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { usePageContext } from './PageContext';

/** The head's 26 high chip reaches a finger's 48. */
const CHIP_SLOP = { top: 11, bottom: 11, left: 4, right: 4 } as const;

function CalendarBlockComponent({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const agenda = useLibraryStore(s => s.agenda);
  const [picking, setPicking] = useState(false);
  // From today's midnight, so the day's events all show.
  const today = instantToDay(Date.now());
  const days = useMemo(() => calendarBlockDays(agenda, block, dayToInstant(today)), [agenda, block, today]);
  const label = calendarBlockLabel(agenda, block);
  const year = Number(today.slice(0, 4));
  const pick = (labelId: string | null): void => {
    setPicking(false);
    updateBlock(page, block.id, { calendarLabelId: labelId });
  };

  return (
    <Organic outline="frame" style={styles.frame}>
      <View style={styles.head}>
        <Icon name="calendar" size={20} color={theme.color.ink} />
        <AppText variant="bodyStrong" style={styles.fill} numberOfLines={1}>
          {label ? label.name : t('Calendar')}
        </AppText>
        {readOnly ? null : (
          <Tappable onPress={() => setPicking(true)} hitSlop={CHIP_SLOP} style={styles.chip} accessibilityRole="button" accessibilityLabel={t('Events shown')}>
            <AppText variant="meta">{label ? t('Label') : t('All events')}</AppText>
            <Icon name="chevronDown" size={16} color={theme.color.inkMuted} />
          </Tappable>
        )}
      </View>
      {readOnly ? null : (
        <Segmented
          value={String(block.calendarDays)}
          options={CALENDAR_BLOCK_DAYS.map(count => ({ value: String(count), label: t('{count} d', { count }) }))}
          onChange={value => updateBlock(page, block.id, { calendarDays: Number(value) })}
        />
      )}
      {days.length === 0 ? (
        <EmptyLine text={t('Nothing planned in the next {count} days.', { count: block.calendarDays })} />
      ) : (
        days.map(({ day, items }) => (
          <View key={day} style={styles.day}>
            <AppText variant="metaStrong" accessibilityRole="header">
              {`${weekdayDay(day, year)} · ${dayDistance(day, today)}`}
            </AppText>
            {items.map(({ occurrence, color }) => {
              const title = occurrence.event.title.trim() || t('Untitled');
              const when = timeRange(occurrence);
              return (
                <Tappable
                  key={occurrence.key}
                  unstable_pressDelay={listPressDelay}
                  onPress={() => void openInApp('calendar', eventPlace(occurrence.seriesId))}
                  style={styles.item}
                  accessibilityRole="link"
                  accessibilityLabel={`${title}, ${when}`}
                >
                  <View style={[styles.dot, { backgroundColor: color ? theme.line[color].fill : theme.color.action }]} />
                  <AppText variant="meta" style={styles.time}>
                    {when}
                  </AppText>
                  <AppText variant="body" style={styles.fill} numberOfLines={1}>
                    {occurrence.event.place.trim() ? `${title} · ${occurrence.event.place.trim()}` : title}
                  </AppText>
                </Tappable>
              );
            })}
          </View>
        ))
      )}
      <Sheet visible={picking} onDismiss={() => setPicking(false)} title={t('Events shown')}>
        <SheetScroll>
          <ListRow icon={block.calendarLabelId === null ? 'check' : 'calendar'} title={t('All events')} onPress={() => pick(null)} />
          {calendarLabels(agenda.labels).map(each => (
            <ListRow
              key={each.id}
              leading={
                each.id === block.calendarLabelId ? (
                  <Icon name="check" size={24} color={theme.color.ink} />
                ) : (
                  // In the rows' 24 slot, so every name starts where the ticked one's does.
                  <View style={styles.tag}>
                    <LabelTag color={each.color} size={18} />
                  </View>
                )
              }
              title={each.name}
              onPress={() => pick(each.id)}
            />
          ))}
        </SheetScroll>
      </Sheet>
    </Organic>
  );
}

export const CalendarBlock = memo(CalendarBlockComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.color.paperHigh },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, ...corners(SHAPES.chip) },
    fill: { flex: 1 },
    day: { gap: 2 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 4, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    dot: { width: 8, height: 8, ...corners(SHAPES.dot) },
    time: { minWidth: 92 },
    tag: { width: 24, alignItems: 'center' },
  });
