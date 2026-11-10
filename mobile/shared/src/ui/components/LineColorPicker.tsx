/** habits-garden's pigments on the brand's pebble, each its neighbour's other turn; the chosen one is ringed in ink and ticked, the ring fading in and the tick settling. */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';

import { Icon } from './Icon';
import { AnimatedOrganic } from './Organic';
import { Tappable } from './Tappable';
import { useChosen } from './useChosen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

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

/** Full rows across the width: as many columns as divide the swatches (14 in sevens, 15 in fives). */
const columnsFor = (count: number): number => [7, 8, 6, 5].find(columns => count % columns === 0) ?? 7;

interface LineColorPickerProps {
  readonly value: LineColor | null;
  readonly onChange: (color: LineColor | null) => void;
  readonly allowNone?: boolean;
  /** Its rows run edge to edge, the first swatch on the column's start (a form's row, its glyph leading it), rather than each centred in its share. */
  readonly flush?: boolean;
  /** What the group is, for a screen reader, when no words show it (« Couleur »). */
  readonly accessibilityLabel?: string;
}

function LineColorPickerComponent({ value, onChange, allowNone = false, flush = false, accessibilityLabel }: LineColorPickerProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const columns = columnsFor(LINE_COLORS.length + (allowNone ? 1 : 0));
  const cell = { width: `${100 / columns}%` } as const;
  const swatches = [
    ...(allowNone ? [<Swatch key="none" label={t('Aucune couleur')} turn={0} selected={value === null} fill="none" tick={theme.color.ink} onFill={false} onPress={() => onChange(null)} />] : []),
    ...LINE_COLORS.map((color, index) => <Swatch key={color} label={LINE_COLOR_NAMES[color]} turn={index + 1} selected={color === value} fill={theme.line[color].fill} tick={theme.line[color].on} onFill onPress={() => onChange(color)} />),
  ];
  if (flush) {
    const rows = Array.from({ length: Math.ceil(swatches.length / columns) }, (_, row) => swatches.slice(row * columns, row * columns + columns));
    return (
      <View style={styles.rows} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
        {rows.map((row, index) => (
          <View key={index} style={styles.flushRow}>
            {row}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {swatches.map(swatch => (
        <View key={swatch.key} style={[styles.cell, cell]}>
          {swatch}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
    // The swatches' own 2 of margin given back, so the first pebble stands on the column's start.
    rows: { gap: 8, marginHorizontal: -2 },
    flushRow: { flexDirection: 'row', justifyContent: 'space-between' },
    cell: { alignItems: 'center' },
    swatch: { width: 40, height: 40, margin: 2, alignItems: 'center', justifyContent: 'center' },
    none: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.outline },
    ring: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: theme.color.ink },
    // Laid over the plain swatch's edge, which its box keeps inside.
    overEdge: { top: -1, left: -1, right: -1, bottom: -1 },
  });

export const LineColorPicker = memo(LineColorPickerComponent);
