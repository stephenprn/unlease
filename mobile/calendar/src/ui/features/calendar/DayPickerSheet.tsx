/**
 * A day to go to (the title pressed) or to set (a date field): a month at a time, today a tap away.
 * The chevrons or a swipe across turn the month; it comes in from the side it was turned to, as
 * Carnet's cook mode turns its steps.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Keyframe, LayoutAnimationConfig } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { monthTitle } from '@unlease/calendar/services/eventText';
import { addMonths } from '@unlease/calendar/services/time';

import { AppText, Button, IconButton, Sheet, SHEET_INSET } from '@shared/ui/components';
import { decelerate, duration, FLING_SPEED } from '@shared/ui/theme/motion';
import { MiniMonth } from './MiniMonth';

/** A month comes in with a short shift and a fade, from the left going back. */
const monthIn = (from: number) =>
  new Keyframe({ 0: { opacity: 0, transform: [{ translateX: from }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);
const MONTH_ON = monthIn(24);
const MONTH_BACK = monthIn(-24);
const TITLE_IN = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: decelerate } }).duration(duration.medium);
/** A swipe this long, or flung (`FLING_SPEED`), turns the month. */
const SWIPE = 48;

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
  /** Which way the month was turned; 0 when the sheet sets it as it opens. */
  const [way, setWay] = useState<1 | -1 | 0>(0);
  useEffect(() => {
    if (!visible) return;
    setWay(0);
    setMonth(day);
  }, [visible, day]);
  const pick = (chosen: string): void => {
    onDay(chosen);
    onDismiss();
  };
  const turn = (direction: 1 | -1): void => {
    setWay(direction);
    setMonth(current => addMonths(current, direction));
  };
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onEnd(event => {
      if (Math.abs(event.translationX) > SWIPE || Math.abs(event.velocityX) > FLING_SPEED) turn(event.translationX < 0 ? 1 : -1);
    });
  const key = month.slice(0, 7);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      {/* The month as the sheet opens is simply there; turned, it comes in. */}
      <LayoutAnimationConfig skipEntering>
        <View style={styles.head}>
          <IconButton icon="back" label={t('Previous month')} shape={1} onPress={() => turn(-1)} />
          <Animated.View key={key} entering={way === 0 ? undefined : TITLE_IN}>
            <AppText variant="bodyStrong">{monthTitle(month)}</AppText>
          </Animated.View>
          {/* The same arrow turned round, as the web's mini-month: a pair, never an arrow and a chevron. */}
          <View style={styles.flip}>
            <IconButton icon="back" label={t('Next month')} shape={2} onPress={() => turn(1)} />
          </View>
        </View>
        <GestureDetector gesture={swipe}>
          <View>
            <Animated.View key={key} entering={way === 0 ? undefined : way === 1 ? MONTH_ON : MONTH_BACK}>
              <MiniMonth month={month} weekStart={weekStart} today={today} chosen={day} onDay={pick} cell={44} />
            </Animated.View>
          </View>
        </GestureDetector>
      </LayoutAnimationConfig>
      <View style={styles.foot}>
        <Button label={t('Today')} kind="text" onPress={() => pick(today)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The chevrons and « Aujourd’hui » on the sheet's column, as its title; the month centred between.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SHEET_INSET },
  foot: { alignItems: 'flex-end', paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  flip: { transform: [{ scaleX: -1 }] },
});
