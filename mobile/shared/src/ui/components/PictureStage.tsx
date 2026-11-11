/**
 * A picture full screen, held as Google Photos holds one: pulled down, it follows the finger and
 * shrinks a little while the black thins behind it, and let go far or fast enough it leaves (short of
 * it, it settles back); pinched, it zooms about the fingers (to five times), and moved while zoomed
 * it pans within its edges; a double tap zooms in where it lands, or back out; swiped sideways
 * (unzoomed) it hands over to the previous or the next picture; a single tap shows or hides the
 * controls laid over it. Its threshold clicks. With Remove animations, it cuts instead of travelling.
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '../../platform/haptics';
import { accelerate, duration, FLING_SPEED, spatial, standard, SWIPE_SHARE, throwTo } from '../theme/motion';

export interface PictureStageProps {
  readonly source: ImageSourcePropType | null;
  /** The viewer's black, which thins as the picture is pulled away. */
  readonly backdrop: string;
  readonly onClose: () => void;
  /** Swiped toward the previous or the next picture (absent: none that way). */
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  /** The controls laid over the picture: a tap hides or shows them; they fade as it is pulled away. */
  readonly children?: React.ReactNode;
}

/** Pulled this far down (or flung), it goes. */
const CLOSE_DRAG = 140;
const CLOSE_SPEED = FLING_SPEED;
/** Swiped past this share of the width (or flung), the next picture comes. */
const TURN_SHARE = SWIPE_SHARE;
const TURN_SPEED = FLING_SPEED;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;

function clamp(value: number, low: number, high: number): number {
  'worklet';
  return Math.min(high, Math.max(low, value));
}

function PictureStageComponent({ source, backdrop, onClose, onPrevious, onNext, children }: PictureStageProps) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const [chrome, setChrome] = useState(true);
  const toggleChrome = useCallback(() => setChrome(shown => !shown), []);
  const hasPrevious = !!onPrevious;
  const hasNext = !!onNext;

  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  /** While unzoomed, what a stroke does once its direction is known: 0 not yet, 1 pull down, 2 turn sideways, 3 nothing. */
  const mode = useSharedValue(0);
  const past = useSharedValue(false);
  const chromeShown = useSharedValue(1);
  /** The picture as drawn unzoomed (contained in the screen), once it has loaded: the screen's size until then. */
  const shownWidth = useSharedValue(width);
  const shownHeight = useSharedValue(height);
  const onLoad = useCallback(
    (event: { nativeEvent: { source: { width: number; height: number } } }) => {
      const { width: own, height: tall } = event.nativeEvent.source;
      if (!own || !tall) return;
      const fit = Math.min(width / own, height / tall);
      shownWidth.value = own * fit;
      shownHeight.value = tall * fit;
    },
    [width, height, shownWidth, shownHeight],
  );

  // A new picture starts whole and centred.
  useEffect(() => {
    scale.value = 1;
    x.value = 0;
    y.value = 0;
  }, [source, scale, x, y]);

  useEffect(() => {
    chromeShown.value = still ? (chrome ? 1 : 0) : withTiming(chrome ? 1 : 0, { duration: duration.short, easing: standard });
  }, [chrome, chromeShown, still]);

  const settle = (value: number, velocity = 0) => {
    'worklet';
    return still ? value : withSpring(value, { ...spatial, velocity });
  };

  /** The pan allowed at a zoom: how far the picture overflows the screen on each side (none where it does not reach the edges). */
  const bounds = (zoom: number) => {
    'worklet';
    return { x: Math.max(0, (shownWidth.value * zoom - width) / 2), y: Math.max(0, (shownHeight.value * zoom - height) / 2) };
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(event => {
      const next = clamp(startScale.value * event.scale, 0.85, MAX_ZOOM + 0.5);
      // The point under the fingers stays under them.
      const focusX = event.focalX - width / 2;
      const focusY = event.focalY - height / 2;
      x.value = focusX - ((focusX - startX.value) * next) / startScale.value;
      y.value = focusY - ((focusY - startY.value) * next) / startScale.value;
      scale.value = next;
    })
    .onEnd(() => {
      const zoom = clamp(scale.value, 1, MAX_ZOOM);
      const edge = bounds(zoom);
      scale.value = settle(zoom);
      x.value = settle(zoom === 1 ? 0 : clamp(x.value, -edge.x, edge.x));
      y.value = settle(zoom === 1 ? 0 : clamp(y.value, -edge.y, edge.y));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
      past.value = false;
      mode.value = 0;
    })
    .onUpdate(event => {
      // Unzoomed, the stroke's first clear way decides it (the start reports no movement yet): down pulls, sideways turns, up does nothing.
      if (mode.value === 0 && scale.value <= 1.01 && Math.hypot(event.translationX, event.translationY) > 8) {
        if (Math.abs(event.translationY) >= Math.abs(event.translationX)) mode.value = event.translationY > 0 ? 1 : 3;
        else mode.value = (event.translationX > 0 && hasPrevious) || (event.translationX < 0 && hasNext) ? 2 : 3;
      }
      if (scale.value > 1.01) {
        // Zoomed: the picture moves within its edges, a little past them under resistance.
        const edge = bounds(scale.value);
        const wantX = startX.value + event.translationX;
        const wantY = startY.value + event.translationY;
        x.value = Math.abs(wantX) > edge.x ? Math.sign(wantX) * (edge.x + (Math.abs(wantX) - edge.x) / 3) : wantX;
        y.value = Math.abs(wantY) > edge.y ? Math.sign(wantY) * (edge.y + (Math.abs(wantY) - edge.y) / 3) : wantY;
        return;
      }
      if (mode.value === 1) {
        x.value = event.translationX * 0.5;
        y.value = Math.max(0, event.translationY);
        const beyond = event.translationY > CLOSE_DRAG;
        if (beyond !== past.value) {
          past.value = beyond;
          runOnJS(haptic)(beyond ? 'threshold' : 'release');
        }
      } else if (mode.value === 2) {
        x.value = event.translationX;
        const beyond = Math.abs(event.translationX) > width * TURN_SHARE;
        if (beyond !== past.value) {
          past.value = beyond;
          runOnJS(haptic)(beyond ? 'threshold' : 'release');
        }
      }
    })
    .onEnd(event => {
      if (scale.value > 1.01) {
        const edge = bounds(scale.value);
        x.value = settle(clamp(x.value, -edge.x, edge.x), event.velocityX);
        y.value = settle(clamp(y.value, -edge.y, edge.y), event.velocityY);
        return;
      }
      if (mode.value === 1) {
        if (event.translationY > CLOSE_DRAG || event.velocityY > CLOSE_SPEED) {
          // Thrown off the bottom with the hand's speed, then the viewer closes on an empty stage.
          y.value = still ? height : throwTo(height, y.value, event.velocityY, finished => {
            if (finished) runOnJS(onClose)();
          });
          if (still) runOnJS(onClose)();
        } else {
          x.value = settle(0, event.velocityX);
          y.value = settle(0, event.velocityY);
        }
      } else if (mode.value === 2) {
        const forward = event.translationX < 0;
        const turned = Math.abs(event.translationX) > width * TURN_SHARE || Math.abs(event.velocityX) > TURN_SPEED;
        if (turned && Math.sign(event.velocityX || event.translationX) === Math.sign(event.translationX)) {
          const turn = forward ? onNext : onPrevious;
          // It leaves on its side; the next one arrives in its place (reset by the source changing).
          x.value = still ? 0 : withTiming(forward ? -width : width, { duration: duration.short, easing: accelerate }, finished => {
            if (finished && turn) runOnJS(turn)();
          });
          if (still && turn) runOnJS(turn)();
        } else {
          x.value = settle(0, event.velocityX);
        }
      }
      mode.value = 0;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(24)
    .onEnd(event => {
      if (scale.value > 1.01) {
        scale.value = settle(1);
        x.value = settle(0);
        y.value = settle(0);
        return;
      }
      // Zoomed in about the tap: that point stays where it was.
      const edge = bounds(DOUBLE_TAP_ZOOM);
      const focusX = event.x - width / 2;
      const focusY = event.y - height / 2;
      scale.value = settle(DOUBLE_TAP_ZOOM);
      x.value = settle(clamp(-focusX * (DOUBLE_TAP_ZOOM - 1), -edge.x, edge.x));
      y.value = settle(clamp(-focusY * (DOUBLE_TAP_ZOOM - 1), -edge.y, edge.y));
    });

  const singleTap = Gesture.Tap()
    .maxDistance(16)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      runOnJS(toggleChrome)();
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const pictureStyle = useAnimatedStyle(() => {
    // Pulled down, it shrinks toward 0.85 as it goes.
    const pulled = scale.value <= 1.01 ? interpolate(y.value, [0, height * 0.6], [1, 0.85], Extrapolation.CLAMP) : 1;
    return { transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value * pulled }] };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: scale.value <= 1.01 ? interpolate(y.value, [0, height * 0.5], [1, 0.15], Extrapolation.CLAMP) : 1,
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: chromeShown.value * (scale.value <= 1.01 ? interpolate(y.value, [0, CLOSE_DRAG], [1, 0], Extrapolation.CLAMP) : 1),
  }));

  return (
    <GestureHandlerRootView style={styles.fill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdrop }, backdropStyle]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, pictureStyle]} collapsable={false}>
          {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={onLoad} /> : null}
        </Animated.View>
      </GestureDetector>
      <Animated.View style={[StyleSheet.absoluteFill, chromeStyle]} pointerEvents={chrome ? 'box-none' : 'none'}>
        {children}
      </Animated.View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

export const PictureStage = memo(PictureStageComponent);
