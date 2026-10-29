/**
 * A picker's swatch: the same round pebble for every choice (a note's colour, gradient and paper;
 * the appearance's colours and grounds), painted as the choice will look. A named swatch presses
 * inside its own pebble, never as a box around it and its name. Chosen, a ring fades in (ink on a
 * colour, matcha on a finish) and the leaf check pebble settles from half its size. Groups fill
 * their sheet's width in full rows (`SwatchGroup`, cells from `swatchCells`).
 */
import React, { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { AnimatedOrganic } from './Organic';
import { PressSurface, Tappable } from './Tappable';
import { useChosen } from './useChosen';

/** Every swatch, colour or finish, is this round pebble. */
export const SWATCH = 52;
const CHECK = 22;

/** In a grid of `columns`, a pebble's turn differs from the one beside it and the one above it. */
export const swatchTurn = (index: number, columns: number): number => index + (columns % 4 === 0 ? Math.floor(index / columns) : 0);

/** The ring and the check of the chosen swatch, laid over its pebble: the ring fades in, the check settles from half its size. */
function Chosen({ progress, turn, ring, checkRing }: { progress: SharedValue<number>; turn: number; ring: 'ink' | 'focus'; checkRing: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ringStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.6) }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.5 + progress.value * 0.5 }] }));
  return (
    <>
      <AnimatedOrganic pointerEvents="none" pebble={turn} style={[StyleSheet.absoluteFill, ring === 'ink' ? styles.ringInk : styles.ringFocus, ringStyle]} />
      <View pointerEvents="none" style={styles.checkSlot}>
        <AnimatedOrganic pebble={2} style={[styles.check, checkRing ? styles.checkRing : null, checkStyle]}>
          <Icon name="check" size={CHECK - 8} color={theme.color.onLeaf} />
        </AnimatedOrganic>
      </View>
    </>
  );
}

export interface SwatchProps {
  readonly label: string;
  readonly selected: boolean;
  readonly turn: number;
  /** The pebble's paint and edge. */
  readonly paint: ViewStyle;
  readonly ring: 'ink' | 'focus';
  /** Written under the pebble. */
  readonly name?: string;
  /** "Sans couleur": struck through while not chosen. */
  readonly struck?: boolean;
  /** The check pebble ringed in paper: it lies on colours of its own family (a palette's split pebble). */
  readonly checkRing?: boolean;
  /** What the pebble holds besides its paint (a glyph on an "add" swatch). */
  readonly children?: React.ReactNode;
  /** A choice among others, or an action (an "add" swatch opens an editor). */
  readonly role?: 'radio' | 'button';
  readonly cell: ViewStyle;
  readonly onPress: () => void;
}

export const Swatch = memo(function Swatch({ label, selected, turn, paint, ring, name, struck = false, checkRing = false, children, role = 'radio', cell, onPress }: SwatchProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const progress = useChosen(selected);
  const slashStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  return (
    <Tappable accessibilityRole={role} accessibilityLabel={label} accessibilityState={role === 'radio' ? { selected } : undefined} onPress={onPress} noTint style={[styles.cell, cell]}>
      <View style={styles.swatch}>
        <PressSurface pebble={turn} style={[StyleSheet.absoluteFill, styles.paint, paint]}>
          {struck ? <Animated.View style={[styles.slash, slashStyle]} /> : null}
          {children}
        </PressSurface>
        {role === 'radio' ? <Chosen progress={progress} turn={turn} ring={ring} checkRing={checkRing} /> : null}
      </View>
      {name ? (
        <AppText variant="labelSmall" color={selected ? theme.color.ink : theme.color.inkMuted} numberOfLines={2} style={styles.name}>
          {name}
        </AppText>
      ) : null}
    </Tappable>
  );
});

/** A group of swatches under its title, the chosen one's name at the head's end (a swatch without a name under it is named there). */
export function SwatchGroup({ title, chosen, children }: { title: string; chosen?: string | null; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.group}>
      <View style={styles.head}>
        <AppText variant="metaStrong">{title}</AppText>
        {chosen ? (
          <AppText variant="meta" numberOfLines={1} style={styles.chosen}>
            {chosen}
          </AppText>
        ) : null}
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {children}
      </View>
    </View>
  );
}

/** Each group fills its sheet's width in full rows: colours in fives, everything else in fours. */
export const swatchCells = StyleSheet.create({
  fifth: { width: '20%' },
  quarter: { width: '25%' },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { gap: 6 },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    chosen: { flexShrink: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { alignItems: 'center', gap: 6, paddingVertical: 6 },
    swatch: { width: SWATCH, height: SWATCH },
    paint: { alignItems: 'center', justifyContent: 'center' },
    // Two lines at most ("Brume lavande"), on a fixed height so every row of names lines up.
    name: { textAlign: 'center', minHeight: 32, paddingHorizontal: 2 },
    // Chosen: a colour is ringed in ink; a finish takes the matcha edge, thick enough to read on any wash.
    ringInk: { borderWidth: 3, borderColor: theme.color.ink },
    ringFocus: { borderWidth: 2.5, borderColor: theme.color.focus },
    checkSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    check: { width: CHECK, height: CHECK, backgroundColor: theme.color.leaf, alignItems: 'center', justifyContent: 'center' },
    // On a pebble of its own family the check stands on a ring of paper, as the selection tick does on a card.
    checkRing: { width: CHECK + 4, height: CHECK + 4, borderWidth: 2, borderColor: theme.color.paper },
    // "No colour": plain paper struck through.
    slash: { width: 2, height: 34, borderRadius: 1, backgroundColor: theme.color.inkMuted, transform: [{ rotate: '45deg' }] },
  });
