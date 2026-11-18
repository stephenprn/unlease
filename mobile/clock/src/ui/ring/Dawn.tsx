/**
 * The dawn over the ringing window's night ground: a warm light rising from its foot, in the accent
 * and Safran, coming up over the first forty seconds as the alarm's volume rises, so the screen that
 * wakes the person brightens as a morning does, never with a flash. Laid over the ground, under
 * everything else, touching nothing. Reduce Motion: the light already there, still.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { withAlpha } from '@unlease/design/color';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** How long the light takes to come up: about as long as the volume's rise. */
const RISE_MS = 40_000;

function DawnComponent({ rising = true }: { readonly rising?: boolean }) {
  const theme = useTheme();
  const still = useReducedMotion();
  const light = useSharedValue(still ? 0.8 : 0);
  useEffect(() => {
    if (still) return;
    // A first glow at once (the window is never a black slab), then the slow rise; answered, it settles where it is.
    light.value = rising ? withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.quad) }) : withTiming(light.value, { duration: 0 });
  }, [rising, still, light]);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * light.value }));
  const sun = theme.color.action;
  const glow = theme.color.waiting;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundImage: [
            // The grounds' own form (`backgrounds.ts`): a circle's glow from below the foot, fading to its own colour.
            `radial-gradient(circle at 50% 112%, ${withAlpha(sun, 0.4)} 0%, ${withAlpha(sun, 0)} 58%)`,
            `radial-gradient(circle at 50% 125%, ${withAlpha(glow, 0.24)} 0%, ${withAlpha(glow, 0)} 85%)`,
          ].join(', '),
        },
        style,
      ]}
    />
  );
}

export const Dawn = memo(DawnComponent);
