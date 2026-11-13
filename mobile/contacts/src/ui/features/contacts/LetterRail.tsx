/**
 * The list's fast scroller, as Google's: the letters down the right edge, the one at the list's top
 * lit as it scrolls. A finger on it (or dragged along it) jumps to that letter's heading, a click at
 * each new letter, the letter shown large beside the finger while it moves; the strip takes a well
 * under the finger so it reads as held. Where the finger is counts along the strip itself, whatever
 * letter it is over.
 */
import React, { memo, useCallback, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { haptic } from '@shared/platform/haptics';

import { AnimatedOrganic, AppText } from '@shared/ui/components';
import { accelerate, decelerate, duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** The letters' strip against the screen's right edge: the rows beside it stop short of it. */
export const RAIL_WIDTH = 28;
/** The large letter beside the finger. */
const BUBBLE = 64;
/** The strip's padding above its first letter and under its last. */
const PAD = 6;

const BUBBLE_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.9 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.short);
const BUBBLE_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.94 }], easing: accelerate } }).duration(duration.fadeBack);

export interface LetterRailProps {
  readonly letters: readonly string[];
  /** The letter heading the list now: lit on the strip. */
  readonly current?: string | null;
  readonly onLetter: (index: number) => void;
}

function LetterRailComponent({ letters, current = null, onLetter }: LetterRailProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const height = useRef(0);
  const last = useRef(-1);
  const [held, setHeld] = useState<string | null>(null);
  // The finger along the strip (for the bubble), and whether it holds it (for the well).
  const finger = useSharedValue(0);
  const holding = useSharedValue(0);

  const pick = useCallback(
    (y: number): void => {
      if (letters.length === 0 || height.current <= 0) return;
      finger.value = Math.max(0, Math.min(height.current, y));
      const span = Math.max(1, height.current - 2 * PAD);
      const index = Math.max(0, Math.min(letters.length - 1, Math.floor(((y - PAD) / span) * letters.length)));
      if (index === last.current) return;
      last.current = index;
      haptic('pick');
      setHeld(letters[index]!);
      onLetter(index);
    },
    [letters, onLetter, finger],
  );
  const release = useCallback((): void => {
    last.current = -1;
    holding.value = withTiming(0, { duration: duration.short, easing: accelerate });
    setHeld(null);
  }, [holding]);

  // On the strip itself, from the first touch: a tap jumps as a drag does.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(event => {
      holding.value = withTiming(1, { duration: duration.short, easing: decelerate });
      pick(event.y);
    })
    .onUpdate(event => pick(event.y))
    .onFinalize(release);

  const well = useAnimatedStyle(() => ({ opacity: holding.value }));
  const bubble = useAnimatedStyle(() => ({ transform: [{ translateY: finger.value - BUBBLE / 2 }] }));

  if (letters.length < 2) return null;
  const at = current ? letters.indexOf(current) : -1;
  const step = (by: 1 | -1): void => {
    const next = Math.max(0, Math.min(letters.length - 1, (at < 0 ? 0 : at) + by));
    onLetter(next);
  };
  const lit = held ?? current;
  return (
    <View style={styles.rail} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          accessibilityRole="adjustable"
          accessibilityLabel={t('Jump to a letter')}
          accessibilityValue={lit ? { text: lit } : undefined}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={event => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
          onLayout={(event: LayoutChangeEvent) => {
            height.current = event.nativeEvent.layout.height;
          }}
        >
          <AnimatedOrganic pointerEvents="none" style={[StyleSheet.absoluteFill, styles.well, well]} />
          {letters.map(letter => (
            <AppText key={letter} variant="labelSmall" color={letter === lit ? theme.color.action : theme.color.inkMuted} style={styles.letter}>
              {letter}
            </AppText>
          ))}
          {held ? (
            <Animated.View pointerEvents="none" style={[styles.bubbleSlot, bubble]}>
              <AnimatedOrganic entering={BUBBLE_IN} exiting={BUBBLE_OUT} style={styles.bubble}>
                <AppText variant="display" color={theme.color.onAction}>
                  {held}
                </AppText>
              </AnimatedOrganic>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    rail: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-end' },
    track: { width: RAIL_WIDTH, paddingVertical: PAD, alignItems: 'center', justifyContent: 'space-between', maxHeight: '80%', ...corners(SHAPES.chip) },
    // Under the finger the strip sinks into a well: it is held.
    well: { backgroundColor: theme.color.field, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline, ...corners(SHAPES.chip) },
    letter: { lineHeight: 15 },
    bubbleSlot: { position: 'absolute', top: 0, right: RAIL_WIDTH + 16, width: BUBBLE, height: BUBBLE },
    bubble: { width: BUBBLE, height: BUBBLE, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.action, ...corners(SHAPES.panel) },
  });

export const LetterRail = memo(LetterRailComponent);
