/**
 * The cut-outs a collection can wear, each in the collection's gouache; the chosen one on paper,
 * ringed in matcha, pinned at a slant as on the collection's page. Choosing one lays its paper
 * pebble down (from 0.9) and turns the cut-out onto its slant; the one left turns back.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { EMBLEMS, EMBLEM_NAMES, type Emblem as EmblemKey } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import { AnimatedOrganic, Emblem, Tappable } from '../../components';
import { useChosen } from '../../components/useChosen';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

/** The slant of a chosen cut-out, as its page's head wears it. */
const SLANT = -8;

const EmblemCell = memo(function EmblemCell({ emblem, turn, selected, color, onChange }: { emblem: EmblemKey; turn: number; selected: boolean; color: LineColor | null; onChange: (emblem: EmblemKey) => void }) {
  const styles = useThemedStyles(makeStyles);
  const progress = useChosen(selected);
  const stone = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.9 + progress.value * 0.1 }] }));
  const cut = useAnimatedStyle(() => ({ transform: [{ rotate: `${SLANT * progress.value}deg` }] }));
  return (
    <Tappable accessibilityRole="radio" accessibilityLabel={EMBLEM_NAMES[emblem]} accessibilityState={{ selected }} onPress={() => onChange(emblem)} pebble={turn} style={styles.cell}>
      <AnimatedOrganic pointerEvents="none" pebble={turn} style={[styles.stone, stone]} />
      <Animated.View style={cut}>
        <Emblem emblem={emblem} color={color} size={34} />
      </Animated.View>
    </Tappable>
  );
});

function EmblemPickerComponent({ value, color, onChange }: { value: EmblemKey; color: LineColor | null; onChange: (emblem: EmblemKey) => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {EMBLEMS.map((emblem, index) => (
        <EmblemCell key={emblem} emblem={emblem} turn={index} selected={emblem === value} color={color} onChange={onChange} />
      ))}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    // A square cell is a pebble, as a swatch is.
    cell: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
    stone: { ...StyleSheet.absoluteFill, backgroundColor: t.color.paper, borderWidth: 2, borderColor: t.color.focus },
  });

export const EmblemPicker = memo(EmblemPickerComponent);
