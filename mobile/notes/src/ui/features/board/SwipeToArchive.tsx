/**
 * Keep's gesture: a card dragged sideways leaves the board for the archive (or out of it), and
 * the snackbar offers it back. Only a horizontal drag takes it, so the wall still scrolls.
 * This is the card's slot on the wall: while it moves it rides above every other card.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '@platform/haptics';

import { duration, spatial, throwTo } from '../../theme/motion';

/** Past this share of the card's width, or flung, the card goes. */
const THRESHOLD = 0.38;
const FLING = 900;

type SlotProps = React.ComponentProps<typeof Animated.View>;

export interface SwipeToArchiveProps {
  readonly id: string;
  readonly width: number;
  readonly enabled: boolean;
  readonly onSwiped: (id: string) => void;
  /** The slot's place on the wall. */
  readonly style: StyleProp<ViewStyle>;
  readonly layout?: SlotProps['layout'];
  readonly entering?: SlotProps['entering'];
  readonly exiting?: SlotProps['exiting'];
  readonly children: React.ReactNode;
}

function SwipeToArchiveComponent({ id, width, enabled, onSwiped, style, layout, entering, exiting, children }: SwipeToArchiveProps) {
  const { width: screen } = useWindowDimensions();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);
  const [thrown, setThrown] = useState(0);

  // Still on the wall a moment after its swipe (Rappels keeps archived notes): back into its place.
  // A card the wall drops is unmounted first, and the timer with it.
  useEffect(() => {
    if (thrown === 0) return;
    const timer = setTimeout(() => {
      x.value = withSpring(0, spatial);
    }, duration.long);
    return () => clearTimeout(timer);
  }, [thrown, x]);
  const swiped = useCallback(
    (swipedId: string) => {
      onSwiped(swipedId);
      setThrown(count => count + 1);
    },
    [onSwiped],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onUpdate(event => {
          x.value = event.translationX;
          // A click when letting go would archive, another when it no longer would.
          const past = Math.abs(event.translationX) > width * THRESHOLD;
          if (past !== armed.value) {
            armed.value = past;
            runOnJS(haptic)(past ? 'threshold' : 'release');
          }
        })
        .onEnd(event => {
          armed.value = false;
          const flung = Math.abs(event.velocityX) > FLING && Math.sign(event.velocityX) === Math.sign(x.value);
          if (Math.abs(x.value) > width * THRESHOLD || flung) {
            x.value = throwTo(Math.sign(x.value) * screen, x.value, event.velocityX, finished => {
              if (finished) runOnJS(swiped)(id);
            });
          } else {
            // Back into its place with the hand's own speed, settling without a bounce.
            x.value = withSpring(0, { ...spatial, velocity: event.velocityX });
          }
        }),
    [enabled, width, screen, id, swiped, x, armed],
  );

  // Lifted above its neighbours for as long as it is off its place, the way back included.
  const slot = useAnimatedStyle(() => ({ zIndex: x.value === 0 ? 0 : 1 }));
  // A sheet pulled off the board: it tilts a little with the hand and turns see-through as it goes (about 0.8 at the
  // threshold, 0.45 a card's width away), then fades out as it leaves the screen.
  const sheet = useAnimatedStyle(() => ({
    opacity: Math.min(
      interpolate(Math.abs(x.value), [0, width], [1, 0.45], Extrapolation.CLAMP),
      interpolate(Math.abs(x.value), [screen * 0.75, screen], [1, 0], Extrapolation.CLAMP),
    ),
    transform: [{ translateX: x.value }, { rotate: `${interpolate(x.value, [-width, 0, width], [-3, 0, 3], Extrapolation.CLAMP)}deg` }],
  }));

  return (
    <Animated.View layout={layout} entering={entering} exiting={exiting} style={[style, slot]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={sheet}>{children}</Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export const SwipeToArchive = memo(SwipeToArchiveComponent);
