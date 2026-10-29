/** habits-garden's pigments on the brand's pebble, each its neighbour's other turn; the chosen one is ringed in ink and ticked, the ring fading in and the tick settling. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';

import { AnimatedOrganic, Icon, Tappable } from '../../components';
import { useChosen } from '../../components/useChosen';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

const Swatch = memo(function Swatch({ label, turn, selected, fill, tick, onFill, onPress }: { label: string; turn: number; selected: boolean; fill: 'none' | string; tick: string; onFill: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const progress = useChosen(selected);
  const ring = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.6) }));
  const check = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.5 + progress.value * 0.5 }] }));
  return (
    <Tappable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      onFill={onFill}
      pebble={turn}
      style={[styles.swatch, fill === 'none' ? styles.none : { backgroundColor: fill }]}
    >
      <AnimatedOrganic pointerEvents="none" pebble={turn} style={[styles.ring, fill === 'none' ? styles.overEdge : null, ring]} />
      <Animated.View style={check}>
        <Icon name="check" size={18} color={tick} />
      </Animated.View>
    </Tappable>
  );
});

function LineColorPickerComponent({ value, onChange, allowNone = false }: { value: LineColor | null; onChange: (color: LineColor | null) => void; allowNone?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {allowNone ? <Swatch label={t('Aucune couleur')} turn={0} selected={value === null} fill="none" tick={theme.color.ink} onFill={false} onPress={() => onChange(null)} /> : null}
      {LINE_COLORS.map((color, index) => (
        <Swatch key={color} label={LINE_COLOR_NAMES[color]} turn={index + 1} selected={color === value} fill={theme.line[color].fill} tick={theme.line[color].on} onFill onPress={() => onChange(color)} />
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    swatch: { width: 40, height: 40, margin: 2, alignItems: 'center', justifyContent: 'center' },
    none: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.outline },
    ring: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: theme.color.ink },
    // Laid over the plain swatch's edge, which its box keeps inside.
    overEdge: { top: -1, left: -1, right: -1, bottom: -1 },
  });

export const LineColorPicker = memo(LineColorPickerComponent);
