/**
 * The slip, habits-garden's toast: leaves on its own after 4 s, or 10 s with an action so "Annuler" can be read and reached.
 * A sticky slip (Claude at work) waits for its answer to replace it, two minutes at most.
 */
import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, Keyframe, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GlyphName } from '@unlease/design/glyphs';
import { ROLES } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { dismissSnack, selectSnack, useUiStore, type Snack, type SnackTone } from '@app/store/uiStore';

import { accelerate, decelerate, duration, spatial, throwTo } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Grain } from './Grain';
import { Icon } from './Icon';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';
import { useKeyboardTop } from './useKeyboardVisible';

/** Room left for the bottom app bar under the snackbar. */
export const SNACK_CLEARANCE = 88;

/** It rises a short way into place; it sinks and fades faster. A newer slip arrives as the old one goes. */
const SLIP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 24 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
const SLIP_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }] }, 100: { opacity: 0, transform: [{ translateY: 12 }], easing: accelerate } }).duration(duration.short);

const TONE_GLYPHS: Record<SnackTone, GlyphName> = { info: 'info', success: 'check', warning: 'alert', error: 'error' };

function SnackbarComponent() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const snack = useUiStore(selectSnack);
  // While typing, the slip rides on the keyboard (a slip behind it, « Label supprimé · Annuler », would be lost).
  const keyboardTop = useKeyboardTop();
  const { height: windowHeight } = useWindowDimensions();
  const bottom = keyboardTop !== null ? Math.max(windowHeight - keyboardTop, 0) + 12 : insets.bottom + SNACK_CLEARANCE;

  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => dismissSnack(snack.id), snack.sticky ? 120_000 : snack.action ? 10_000 : 4_000);
    return () => clearTimeout(timer);
  }, [snack]);

  // The host stays, so the slip's own exit can play when it goes.
  return (
    <View pointerEvents="box-none" collapsable={false} style={[styles.host, { bottom }]}>
      {snack ? (
        <Animated.View key={snack.id} entering={SLIP_IN} exiting={SLIP_OUT} accessibilityLiveRegion="polite">
          <Slip id={snack.id} message={snack.message} tone={snack.tone} action={snack.action} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Swiped sideways, as Android's snackbars are, it is thrown off with the hand's speed. */
function Slip({ id, message, tone, action }: Pick<Snack, 'id' | 'message' | 'tone' | 'action'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onUpdate(event => {
          x.value = event.translationX;
        })
        .onEnd(event => {
          if (Math.abs(event.translationX) > width * 0.3 || Math.abs(event.velocityX) > 900) {
            const side = Math.sign(event.translationX || event.velocityX);
            x.value = throwTo(side * width, x.value, event.velocityX, finished => {
              if (finished) runOnJS(dismissSnack)(id);
            });
          } else {
            x.value = withSpring(0, { ...spatial, velocity: event.velocityX });
          }
        }),
    [id, width, x],
  );
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.value), [0, width * 0.6], [1, 0.2], Extrapolation.CLAMP),
    transform: [{ translateX: x.value }],
  }));
  // The slip is dark in both themes: a warning or a failure takes the night's signal inks.
  const toneColor = tone === 'success' ? theme.color.slipAction : tone === 'warning' ? ROLES.dark.waiting : tone === 'error' ? ROLES.dark.danger : theme.color.onSlipMuted;
  return (
    <GestureDetector gesture={pan}>
      <AnimatedOrganic style={[styles.bar, style]}>
        <Organic style={[styles.clip, action ? styles.withAction : null]}>
          <Grain />
          <Icon name={TONE_GLYPHS[tone]} size={20} color={toneColor} />
          <AppText variant="body" color={theme.color.onSlip} style={styles.message} numberOfLines={2}>
            {message}
          </AppText>
          {action ? (
            <Tappable
              onDark
              hitSlop={4}
              style={styles.action}
              onPress={() => {
                action.run();
                dismissSnack(id);
              }}
            >
              <AppText variant="label" color={theme.color.slipAction}>
                {action.label}
              </AppText>
            </Tappable>
          ) : null}
        </Organic>
      </AnimatedOrganic>
    </GestureDetector>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    host: { position: 'absolute', left: 12, right: 12 },
    bar: { ...corners(SHAPES.slip), backgroundColor: t.color.slip, boxShadow: t.lift.float },
    // The same 16 on both sides; with an action, its chip sits 6 in from the edge, as from the top and the foot.
    clip: { ...corners(SHAPES.slip), overflow: 'hidden', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16 },
    withAction: { paddingRight: 6 },
    message: { flex: 1, paddingVertical: 14 },
    // habits-garden's toast action: its own chip on the slip, edged in cream.
    action: { minHeight: 40, marginVertical: 6, paddingHorizontal: 14, justifyContent: 'center', ...corners(SHAPES.chip), borderWidth: 1, borderColor: 'rgba(249, 244, 237, 0.22)' },
  });

export const Snackbar = memo(SnackbarComponent);
