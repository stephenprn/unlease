/**
 * A figure whose characters roll as they change, as a counter's wheels do: each in its own slot, the
 * old one leaving upward as the new one rises from below (220, decelerate), clipped by its slot so
 * nothing spills. Only the characters that change move; a change caught mid-roll starts from there.
 * Reduce Motion: they simply change.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@shared/ui/components';
import { decelerate } from '@shared/ui/theme/motion';

/** How far a character travels, as a share of its line. */
const TRAVEL = 0.55;
const ROLL_MS = 220;

interface Props {
  readonly text: string;
  /** The characters' style; `lineHeight` is the slot's height. */
  readonly style: StyleProp<TextStyle>;
  readonly lineHeight: number;
}

function Slot({ character, style, lineHeight, still }: { readonly character: string; readonly style: StyleProp<TextStyle>; readonly lineHeight: number; readonly still: boolean }) {
  // The character shown before this one, kept while it rolls away.
  const [shown, setShown] = useState({ now: character, before: character });
  if (shown.now !== character) setShown({ now: character, before: shown.now });
  const roll = useSharedValue(1);
  useEffect(() => {
    if (shown.before === shown.now || still) {
      roll.value = 1;
      return;
    }
    roll.value = 0;
    roll.value = withTiming(1, { duration: ROLL_MS, easing: decelerate });
  }, [shown, still, roll]);
  const travel = lineHeight * TRAVEL;
  const coming = useAnimatedStyle(() => ({ opacity: roll.value, transform: [{ translateY: (1 - roll.value) * travel }] }));
  const going = useAnimatedStyle(() => ({ opacity: 1 - roll.value, transform: [{ translateY: -roll.value * travel }] }));
  return (
    <View style={[styles.slot, { height: lineHeight }]}>
      <Animated.View style={coming}>
        <AppText style={style}>{shown.now}</AppText>
      </Animated.View>
      {shown.before !== shown.now ? (
        <Animated.View style={[StyleSheet.absoluteFill, going]}>
          <AppText style={style}>{shown.before}</AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

function RollingFigureComponent({ text, style, lineHeight }: Props) {
  const still = useReducedMotion();
  return (
    <View style={styles.row}>
      {[...text].map((character, index) => (
        // A slot per place, so 09 → 10 rolls both wheels.
        <Slot key={`${text.length}:${index}`} character={character} style={style} lineHeight={lineHeight} still={still} />
      ))}
    </View>
  );
}

export const RollingFigure = memo(RollingFigureComponent);

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  slot: { overflow: 'hidden' },
});
