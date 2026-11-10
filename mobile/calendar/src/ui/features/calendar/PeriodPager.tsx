/**
 * The period on screen under the hand, with the one before and the one after drawn beside it, as
 * pages: a swipe across follows the finger and shows the next period coming in from its side. Let go
 * far or fast enough (its threshold clicks, as Carnet's swipes do), the next period is laid in place
 * with the hand's speed; short of it, both spring back. A jump (« Aujourd'hui », a day picked) comes
 * in from the side of the time it goes to; another view fades in. Reduce Motion: the period simply
 * changes.
 *
 * Three pages turn round: page n sits in slot n mod 3, so the page swiped to is already drawn, keeps
 * its place and never changes as it becomes the one on screen; only the page left behind on the far
 * side is drawn again, out of sight. The time grids keep the same hours in all three (`usePeriodScroll`).
 */
import React, { createContext, memo, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { haptic } from '@shared/platform/haptics';
import { decelerate, duration, fling, flingDuration, spatial } from '@shared/ui/theme/motion';

/** Past this share of the width, or flung, the period turns. */
const THRESHOLD = 0.3;
const FLING = 800;
/** How far a period jumped to comes in from (Carnet's steps come 24; a whole calendar a little more). */
const ENTER_SHIFT = 40;
const SLOTS = [0, 1, 2] as const;

/** Where slot `slot` stands while page `page` is on screen: -1 before, 0 on screen, 1 after. */
function roleOf(slot: number, page: number): -1 | 0 | 1 {
  'worklet';
  const at = (((slot - page) % 3) + 3) % 3;
  return at === 0 ? 0 : at === 1 ? 1 : -1;
}

/** What a page drawn in the pager shares with the others: the hours its time grid shows. */
export interface PeriodScroll {
  /** The time grids' scroll, written by the one on screen (-1 until it scrolls). */
  readonly y: SharedValue<number>;
  /** Whether this page is the one on screen (read on the UI thread). */
  readonly shown: () => boolean;
}

const PeriodScrollContext = createContext<PeriodScroll | null>(null);

/** In a pager, the scroll the time grids keep in step; null elsewhere. */
export const usePeriodScroll = (): PeriodScroll | null => useContext(PeriodScrollContext);

export interface PeriodPagerProps {
  /** What is on screen: the view and its period's key (`2026-12-07`, `2026-12`, `2026`). A change of it comes in. */
  readonly view: string;
  readonly period: string;
  /** The days the period before, this one and the one after are drawn from. */
  readonly anchors: readonly [string, string, string];
  /** Whether a swipe turns it (the schedule scrolls instead, alone). */
  readonly swipes: boolean;
  /** The period after (1) or before (-1). */
  readonly onStep: (direction: 1 | -1) => void;
  /** A swipe let go that will turn the period (1 or -1), as the next page sets off: its title can change with it. */
  readonly onTurning?: (direction: 1 | -1) => void;
  /** Draws a period from its day; `shown` while it is the one on screen. */
  readonly renderPeriod: (anchor: string, shown: boolean) => React.ReactNode;
}

/** One of the three pages: where it stands follows the page on screen, on the UI thread. */
const Slot = memo(function Slot({ slot, page, x, width, enter, fade, scrollY, children }: { slot: number; page: SharedValue<number>; x: SharedValue<number>; width: SharedValue<number>; enter: SharedValue<number>; fade: SharedValue<number>; scrollY: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const role = roleOf(slot, page.value);
    const current = role === 0;
    return {
      opacity: current ? fade.value : 1,
      transform: [{ translateX: role * (width.value || 1000) + x.value + (current ? enter.value : 0) }],
    };
  });
  const shown = useCallback(() => {
    'worklet';
    return roleOf(slot, page.value) === 0;
  }, [slot, page]);
  const scroll = useMemo<PeriodScroll>(() => ({ y: scrollY, shown }), [scrollY, shown]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <PeriodScrollContext.Provider value={scroll}>{children}</PeriodScrollContext.Provider>
    </Animated.View>
  );
});

function PeriodPagerComponent({ view, period, anchors, swipes, onStep, onTurning, renderPeriod }: PeriodPagerProps) {
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const enter = useSharedValue(0);
  const fade = useSharedValue(1);
  const origin = useSharedValue(0);
  const armed = useSharedValue(false);
  const scrollY = useSharedValue(-1);
  /** The page on screen, as the UI thread draws it: it turns the moment a throw lands, before the new period arrives. */
  const page = useSharedValue(0);
  /** The pages swiped through (a direction each) whose periods have not shown yet. */
  const swiped = useRef(0);

  // The page on screen, as React draws it: a period swiped to is the next (or previous) page, any other change keeps it.
  const [shown, setShown] = useState({ view, period, index: 0 });
  let index = shown.index;
  if (shown.view !== view || shown.period !== period) {
    index = shown.view === view ? shown.index + swiped.current : shown.index;
    setShown({ view, period, index });
  }

  const turning = useCallback((direction: 1 | -1) => onTurning?.(direction), [onTurning]);

  const turn = useCallback(
    (direction: 1 | -1) => {
      swiped.current += direction;
      onStep(direction);
      // A step that changed nothing (none should) never leaves another period on screen.
      setTimeout(() => {
        if (swiped.current === 0) return;
        swiped.current = 0;
        page.value = index;
      }, 1000);
    },
    [onStep, page, index],
  );

  // A new period comes in: swiped to, it is already in place; jumped to, from the side of its time; another view fades in.
  const before = useRef({ view, period });
  useLayoutEffect(() => {
    page.value = index;
    const was = before.current;
    if (was.view === view && was.period === period) return;
    before.current = { view, period };
    const direction = swiped.current;
    swiped.current = 0;
    if (direction !== 0) return;
    cancelAnimation(enter);
    cancelAnimation(fade);
    if (reduced) {
      enter.value = 0;
      fade.value = 1;
      return;
    }
    const arrive = { duration: duration.medium, easing: decelerate };
    if (was.view !== view) {
      enter.value = 0;
      fade.value = 0;
      fade.value = withTiming(1, arrive);
      return;
    }
    enter.value = (period > was.period ? 1 : -1) * ENTER_SHIFT;
    enter.value = withTiming(0, arrive);
    fade.value = 0;
    fade.value = withTiming(1, arrive);
  }, [view, period, index, reduced, page, enter, fade]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipes)
        .activeOffsetX([-24, 24])
        .failOffsetY([-14, 14])
        .onStart(() => {
          // Caught on its way in: it goes on from where it is, whole.
          cancelAnimation(x);
          cancelAnimation(enter);
          cancelAnimation(fade);
          x.value += enter.value;
          enter.value = 0;
          fade.value = 1;
          origin.value = reduced ? 0 : x.value;
        })
        .onUpdate(event => {
          const at = origin.value + event.translationX;
          if (!reduced) x.value = at;
          // A click when letting go would turn the period, another when it no longer would.
          const past = Math.abs(at) > (width.value || 1) * THRESHOLD;
          if (past !== armed.value) {
            armed.value = past;
            runOnJS(haptic)(past ? 'threshold' : 'release');
          }
        })
        .onEnd(event => {
          armed.value = false;
          const at = origin.value + event.translationX;
          const flung = Math.abs(event.velocityX) > FLING && Math.sign(event.velocityX) === Math.sign(at);
          if (Math.abs(at) <= (width.value || 1) * THRESHOLD && !flung) {
            // Back into place with the hand's own speed, settling without a bounce.
            x.value = withSpring(0, { ...spatial, velocity: event.velocityX });
            return;
          }
          // Dragged to the left, the period after comes from the right.
          const direction: 1 | -1 = at < 0 ? 1 : -1;
          runOnJS(turning)(direction);
          if (reduced) {
            x.value = 0;
            runOnJS(turn)(direction);
            return;
          }
          // The next page laid in place with the hand's speed, then the pages turn round under it, unmoved.
          const target = -direction * (width.value || 400);
          const thrown = Math.abs(event.velocityX) > 1000 && Math.sign(event.velocityX) === Math.sign(target - x.value);
          const timing = thrown ? { duration: flingDuration(target - x.value, event.velocityX), easing: fling } : { duration: duration.medium, easing: decelerate };
          x.value = withTiming(target, timing, finished => {
            if (!finished) return;
            page.value += direction;
            x.value = 0;
            runOnJS(turn)(direction);
          });
        }),
    [swipes, reduced, x, enter, fade, origin, armed, width, page, turn, turning],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  // Page `p` sits in slot `p mod 3`: the slots draw the pages around the one on screen.
  const pages = SLOTS.map(slot => {
    const role = roleOf(slot, index);
    return { slot, role, anchor: anchors[role + 1]! };
  });

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={onLayout} style={styles.fill}>
        {pages.map(({ slot, role, anchor }) =>
          swipes || role === 0 ? (
            <Slot key={slot} slot={slot} page={page} x={x} width={width} enter={enter} fade={fade} scrollY={scrollY}>
              {renderPeriod(anchor, role === 0)}
            </Slot>
          ) : null,
        )}
      </View>
    </GestureDetector>
  );
}

export const PeriodPager = memo(PeriodPagerComponent);

const styles = StyleSheet.create({
  // The pages beside the one on screen stay out of sight until a swipe brings them in.
  fill: { flex: 1, overflow: 'hidden' },
});
