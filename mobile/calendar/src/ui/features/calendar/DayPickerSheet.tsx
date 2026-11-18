/**
 * A day to go to (the title pressed) or to set (a date field): a month at a time, today a tap away.
 * A swipe across turns the months as the calendar's own pages turn (`PeriodPager`): the month follows
 * the finger with the next one drawn beside it, its threshold clicks, a throw lands with the hand's
 * speed. The chevrons jump a month, which comes in from its side.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe, LayoutAnimationConfig } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { monthTitle } from '@unlease/calendar/services/eventText';
import { addMonths } from '@unlease/calendar/services/time';

import { AppText, Button, IconButton, Sheet, SHEET_INSET } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { MiniMonth } from './MiniMonth';
import { PeriodPager } from './PeriodPager';

const TITLE_IN = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: decelerate } }).duration(duration.medium);
/** A day's cell in the sheet. */
const CELL = 44;
/**
 * The pages' height: six weeks under the weekdays' initials, the most a month spans, so the sheet
 * keeps its size as months of four, five or six weeks pass under the hand.
 */
const PAGE_HEIGHT = Math.ceil(CELL * 0.7 + 6 * CELL);

export interface DayPickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly day: string;
  readonly today: string;
  readonly weekStart: number;
  readonly onDismiss: () => void;
  readonly onDay: (day: string) => void;
}

export function DayPickerSheet({ visible, title, day, today, weekStart, onDismiss, onDay }: DayPickerSheetProps) {
  const [month, setMonth] = useState(day);
  // Opened, it shows the day's month at once: set as it renders, so the pager never sees a jump to it.
  const [opened, setOpened] = useState({ visible, day });
  if (opened.visible !== visible || opened.day !== day) {
    setOpened({ visible, day });
    if (visible) setMonth(day);
  }
  const shownMonth = useRef(month);
  shownMonth.current = month;

  const pick = useCallback(
    (chosen: string): void => {
      onDay(chosen);
      onDismiss();
    },
    [onDay, onDismiss],
  );
  const step = useCallback((direction: 1 | -1): void => setMonth(current => addMonths(current, direction)), []);
  // The month a swipe let go goes to: its title shows as its page sets off, not once it has landed.
  const [heading, setHeading] = useState<{ readonly from: string; readonly to: string } | null>(null);
  const turning = useCallback((direction: 1 | -1): void => setHeading({ from: shownMonth.current, to: addMonths(shownMonth.current, direction) }), []);
  const titleMonth = heading && heading.from === month ? heading.to : month;
  // Once on another month, the swipe's title is spent (a later turn back to its month must not wear it).
  useEffect(() => setHeading(null), [month]);

  const key = month.slice(0, 7);
  const anchors = useMemo((): [string, string, string] => [addMonths(month, -1), month, addMonths(month, 1)], [month]);
  const renderMonth = useCallback(
    (anchor: string) => <MiniMonth month={anchor} weekStart={weekStart} today={today} chosen={day} onDay={pick} cell={CELL} />,
    [weekStart, today, day, pick],
  );
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      <View style={styles.head}>
        <IconButton icon="back" label={t('Previous month')} shape={1} onPress={() => step(-1)} />
        {/* The month as the sheet opens is simply there; turned, its name comes in. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.View key={titleMonth.slice(0, 7)} entering={TITLE_IN}>
            <AppText variant="bodyStrong">{monthTitle(titleMonth)}</AppText>
          </Animated.View>
        </LayoutAnimationConfig>
        {/* The same arrow turned round, as the web's mini-month: a pair, never an arrow and a chevron. */}
        <View style={styles.flip}>
          <IconButton icon="back" label={t('Next month')} shape={2} onPress={() => step(1)} />
        </View>
      </View>
      <View style={styles.pages}>
        <PeriodPager view="month" period={key} anchors={anchors} swipes onStep={step} onTurning={turning} renderPeriod={renderMonth} />
      </View>
      <View style={styles.foot}>
        <Button label={t('Today')} kind="text" onPress={() => pick(today)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The chevrons and « Aujourd’hui » on the sheet's column, as its title; the month centred between.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SHEET_INSET },
  pages: { height: PAGE_HEIGHT },
  foot: { alignItems: 'flex-end', paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  flip: { transform: [{ scaleX: -1 }] },
});
