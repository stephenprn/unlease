/**
 * Material's modal bottom sheet. Rendered in place, not in a native Modal, so it stays under
 * the app's snackbar and inside the navigator: mount it at the root of a screen or of the app.
 * It rises once its height is known, leaves faster than it came, and a drag on its handle
 * follows the finger: let go, it settles back or is thrown off with the hand's speed.
 */
import React, { createContext, memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';

import { accelerate, decelerate, duration, spatialSlow, throwTo } from '../theme/motion';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Grain } from './Grain';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';
import { useKeyboardTop } from './useKeyboardVisible';

export interface SheetProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly title?: string;
  readonly children?: React.ReactNode;
  /** Let the content grow to most of the screen. */
  readonly tall?: boolean;
}

/** Whether a sheet darkens what is under it: the quick window over the home screen is its own scrim. */
export const SheetScrim = createContext(true);

/** Pulled this far down, or flung, it goes. */
/** The sheet's outline: its top edge and corners; its sides and foot run straight off the screen. */
const OUTLINE = 'sheet';
const DISMISS_DRAG = 120;
const DISMISS_SPEED = 900;

function SheetComponent({ visible, onDismiss, title, children, tall = false }: SheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const keyboardTop = useKeyboardTop();
  const keyboard = keyboardTop !== null;
  const scrim = useContext(SheetScrim);
  // Where the anchor ends in the window, so the keyboard's overlap is known even when it was up before the sheet opened.
  const anchor = useRef<React.ComponentRef<typeof View>>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const measureAnchor = useCallback(() => anchor.current?.measureInWindow((_x, y, _width, height) => setAnchorBottom(y + height)), []);
  const lift = keyboardTop !== null && anchorBottom !== null ? Math.max(0, anchorBottom - keyboardTop) : 0;
  // Stays mounted while it leaves; `shown` runs 0 to 1, `drag` is the hand's pull, `height` the panel's own.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const shown = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(0);
  const thrown = useRef(false);

  const unmount = useCallback(() => {
    height.value = 0;
    drag.value = 0;
    thrown.current = false;
    setAnchorBottom(null);
    setMounted(false);
  }, [height, drag]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

  useEffect(() => {
    if (visible) {
      // Opening again while it leaves: it turns round from where it is.
      thrown.current = false;
      if (height.value > 0) {
        drag.value = withSpring(0, spatialSlow);
        shown.value = withTiming(1, { duration: duration.long, easing: decelerate });
      }
      return;
    }
    // A sheet thrown off by the hand finishes on its own; anything else leaves the M3 way.
    if (!mounted || thrown.current) return;
    shown.value = withTiming(0, { duration: duration.exit, easing: accelerate }, finished => {
      if (finished) runOnJS(unmount)();
    });
  }, [visible, mounted, shown, height, drag, unmount]);

  // It rises only once its height is known, so the motion is the panel's own, not the screen's.
  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const first = height.value === 0;
      height.value = event.nativeEvent.layout.height;
      if (first && visible) shown.value = withTiming(1, { duration: duration.long, easing: decelerate });
    },
    [height, shown, visible],
  );

  const markThrown = useCallback(() => {
    thrown.current = true;
  }, []);

  const pan = Gesture.Pan()
    .onUpdate(event => {
      // Down it follows the finger; up it resists, it is already as high as it goes.
      drag.value = event.translationY >= 0 ? event.translationY : -Math.sqrt(-event.translationY) * 2;
    })
    .onEnd(event => {
      if (event.translationY > DISMISS_DRAG || event.velocityY > DISMISS_SPEED) {
        runOnJS(markThrown)();
        runOnJS(onDismiss)();
        drag.value = throwTo(height.value + 48, drag.value, event.velocityY, finished => {
          if (finished) runOnJS(unmount)();
        });
      } else {
        drag.value = withSpring(0, { ...spatialSlow, velocity: event.velocityY });
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: shown.value * interpolate(drag.value, [0, Math.max(1, height.value)], [1, 0], Extrapolation.CLAMP),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    // A little past its own height, so its lift is gone too.
    transform: [{ translateY: (1 - shown.value) * (height.value ? height.value + 24 : screen) + drag.value }],
  }));

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Tappable accessibilityLabel={t('Fermer')} onPress={onDismiss} style={scrim ? styles.scrim : styles.clear} noTint />
      </Animated.View>
      {/* The lift comes out of this box, so the panel gives height back instead of leaving the screen. */}
      <View ref={anchor} onLayout={measureAnchor} style={[styles.anchor, { paddingTop: insets.top + 8, paddingBottom: lift }]} pointerEvents="box-none">
        <AnimatedOrganic
          outline={OUTLINE}
          onLayout={onPanelLayout}
          // On the keyboard the content runs down to its edge (a strip of empty panel there read as a black band cutting it), and the keyboard already spans the gesture bar.
          style={[styles.panel, { maxHeight: screen * (tall ? 0.88 : 0.75), paddingBottom: keyboard ? 0 : Math.max(insets.bottom, 16) }, panelStyle]}
        >
          <Organic outline={OUTLINE} style={styles.paper} pointerEvents="none">
            <Grain />
          </Organic>
          <GestureDetector gesture={pan}>
            <View style={styles.handleZone} accessibilityElementsHidden>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {title ? (
            <AppText variant="title" style={styles.title} accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          {children}
        </AnimatedOrganic>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.color.scrim },
    clear: { flex: 1 },
    anchor: { flex: 1, justifyContent: 'flex-end' },
    // habits-garden's sheet: the ground's own paper, a firm lip (at night it is all that parts it from the scrim), its two top corners uneven.
    panel: {
      backgroundColor: theme.color.wall,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.color.outline,
      paddingHorizontal: 16,
      boxShadow: theme.lift.float,
      flexShrink: 1,
    },
    // The grain is clipped by its own layer: the panel must not clip, or the shadow goes too.
    paper: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
    handleZone: { height: 28, alignItems: 'center', justifyContent: 'center' },
    handle: { width: 36, height: 5, borderTopLeftRadius: 3, borderTopRightRadius: 2, borderBottomRightRadius: 3, borderBottomLeftRadius: 2, backgroundColor: theme.color.outline },
    title: { marginBottom: 12, marginHorizontal: 8 },
  });

export const Sheet = memo(SheetComponent);

/** A sheet's scrolling body: it shrinks with the panel, so every field stays reachable above the keyboard. */
export function SheetScroll({ style, ...rest }: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" style={[shrink.scroll, style]} {...rest} />;
}

const shrink = StyleSheet.create({ scroll: { flexShrink: 1 } });
