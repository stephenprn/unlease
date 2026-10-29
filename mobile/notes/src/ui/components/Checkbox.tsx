/**
 * A box inside a pebble target; ticked, it fades to the second ink: neutral on any note's colour.
 * The open box and the ticked one trade places in 150. Disabled (a note in the bin) it reads the
 * same and does nothing.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, standard } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

const BOX = 22;

function CheckboxComponent({ checked, onToggle, label, disabled = false }: { checked: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  const theme = useTheme();
  const on = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: duration.short, easing: standard });
  }, [checked, on]);
  const open = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const ticked = useAnimatedStyle(() => ({ opacity: on.value }));
  return (
    <Tappable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={label} onPress={onToggle} disabled={disabled} ownDisabled hitSlop={4} pebble={1} style={styles.target}>
      <View style={styles.box}>
        <Animated.View style={[StyleSheet.absoluteFill, open]}>
          <Icon name="box" size={BOX} color={theme.color.ink} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, ticked]}>
          <Icon name="boxChecked" size={BOX} color={theme.color.inkMuted} />
        </Animated.View>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  target: { width: 40, height: 40, margin: 2, alignItems: 'center', justifyContent: 'center' },
  box: { width: BOX, height: BOX },
});

export const Checkbox = memo(CheckboxComponent);
