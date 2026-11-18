/**
 * The week of mornings: seven days from today across the screen, each a column (its weekday, its
 * date, the time that rings that morning or a dash, a dot when an event starts that day, in Safran
 * when it comes too soon after the alarm); the chosen morning lies on the primary's wash, today's date
 * is in the accent's ink. A column pressed opens that morning below (`MorningPanel`).
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { longDay, shortWeekday } from '@unlease/calendar/services/eventText';
import { partsOf, weekdayOf } from '@unlease/calendar/services/time';
import { SHAPES } from '@unlease/design/shapes';
import type { Morning } from '@unlease/clock/services/week';
import { alarmClock } from '@unlease/clock/services/words';
import { AppText, Icon, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

interface Props {
  readonly week: readonly Morning[];
  readonly chosen: string;
  readonly today: string;
  /** Today's ring already gone by reads in the second ink. */
  readonly now: number;
  readonly twelveHours: boolean;
  readonly onChoose: (day: string) => void;
}

function Column({ morning, chosen, today, gone, twelveHours, onChoose }: { readonly morning: Morning; readonly chosen: boolean; readonly today: boolean; readonly gone: boolean; readonly twelveHours: boolean; readonly onChoose: (day: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = chosen ? theme.color.onActionContainer : theme.color.ink;
  const muted = chosen ? theme.color.onActionContainer : theme.color.inkMuted;
  const time = morning.waking ? alarmClock(morning.waking.alarm.time, twelveHours) : null;
  const dot = morning.events > 0 ? (chosen ? theme.color.onActionContainer : theme.color.link) : 'transparent';
  // A clash reads from across the room: its time in Safran, the alert glyph where the dot goes.
  const clash = morning.clash !== null;
  const label = [
    longDay(morning.day),
    time ? t('Alarm at {time}', { time }) : t('No alarm'),
    // What keeps an alarm quiet that morning is said too: the column alone shows a dash.
    morning.offDay ? morning.offDay.reason || t('a day off') : '',
    morning.skipped.length > 0 ? t('Skipped') : '',
    morning.clash ? t('An event too soon after the alarm') : morning.events > 0 ? plural(morning.events, 'event') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Tappable
      onPress={() => onChoose(morning.day)}
      style={[styles.column, chosen && styles.chosen]}
      // A tab of the week's tablist: TalkBack says « onglet, 3 sur 7, sélectionné ».
      accessibilityRole="tab"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={label}
    >
      <AppText variant="labelSmall" color={muted} numberOfLines={1}>
        {shortWeekday(weekdayOf(morning.day))}
      </AppText>
      <AppText variant="title" color={today && !chosen ? theme.color.action : ink} style={styles.date}>
        {partsOf(morning.day).day}
      </AppText>
      <AppText variant="meta" color={clash && !chosen ? theme.color.waiting : time && !gone ? ink : muted} style={[styles.time, clash && styles.clashTime]} numberOfLines={1} adjustsFontSizeToFit>
        {time ?? '—'}
      </AppText>
      {clash ? (
        <View style={styles.mark}>
          <Icon name="alert" size={12} color={chosen ? theme.color.onActionContainer : theme.color.waiting} />
        </View>
      ) : (
        <View style={[styles.dot, { backgroundColor: dot }]} />
      )}
    </Tappable>
  );
}

function WeekStripComponent({ week, chosen, today, now, twelveHours, onChoose }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.strip} accessibilityRole="tablist" accessibilityLabel={t('The week’s mornings')}>
      {week.map(morning => (
        <Column key={morning.day} morning={morning} chosen={morning.day === chosen} today={morning.day === today} gone={morning.waking !== null && morning.waking.at <= now} twelveHours={twelveHours} onChoose={onChoose} />
      ))}
    </View>
  );
}

export const WeekStrip = memo(WeekStripComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    strip: { flexDirection: 'row', gap: 4, paddingHorizontal: 12 },
    column: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 8, ...corners(SHAPES.tab) },
    chosen: { backgroundColor: theme.color.actionContainer },
    date: { fontVariant: ['tabular-nums'] },
    time: { fontVariant: ['tabular-nums'] },
    dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
    clashTime: { fontFamily: fontFamily(theme, 'SemiBold') },
    // The glyph takes the dot's room and a little more, so the columns keep one height.
    mark: { marginTop: -1, marginBottom: -3 },
  });
}

