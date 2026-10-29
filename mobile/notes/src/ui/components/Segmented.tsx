/**
 * A choice among two to four: segments in a sunken track, the chosen one a sheet of paper lifted
 * out of it, its label in ink and its tick in matcha. The sheet is one piece that slides to the
 * segment chosen, so the choice is seen moving; it sits concentric in the track.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';

import { duration, standard } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: GlyphName;
}

/** 44 tall in a track padded by 4: the slop reaches Material's 48. */
const VERTICAL_SLOP = { top: 4, bottom: 4 };
const INSET = 4;
const GAP = 4;

/** `disabled`: shown faded (each segment's own fade), nothing taken: a setting not available yet. */
function SegmentedComponent<T extends string>({ options, value, onChange, disabled }: { options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; disabled?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [track, setTrack] = useState(0);
  const chosen = Math.max(0, options.findIndex(option => option.value === value));
  const segment = track > 0 ? (track - INSET * 2 - GAP * (options.length - 1)) / options.length : 0;
  const at = useSharedValue(chosen);
  useEffect(() => {
    at.value = withTiming(chosen, { duration: duration.medium, easing: standard });
  }, [chosen, at]);
  // The tick and the inks change hands as the pebble passes the middle of its way, not before it has left.
  const [drawn, setDrawn] = useState(chosen);
  useEffect(() => {
    if (drawn === chosen) return;
    const timer = setTimeout(() => setDrawn(chosen), duration.medium / 2);
    return () => clearTimeout(timer);
  }, [chosen, drawn]);
  const pebble = useAnimatedStyle(() => ({ width: segment, transform: [{ translateX: INSET + at.value * (segment + GAP) }] }), [segment]);

  return (
    <Organic style={styles.track} accessibilityRole="radiogroup" onLayout={event => setTrack(event.nativeEvent.layout.width)}>
      {segment > 0 ? <AnimatedOrganic pointerEvents="none" style={[styles.pebble, pebble]} /> : null}
      {options.map((option, index) => {
        const selected = index === chosen;
        const shown = index === drawn;
        const ink = shown ? theme.color.ink : theme.color.inkMuted;
        return (
          <Tappable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            hitSlop={VERTICAL_SLOP}
            // Until the track is measured the chosen segment wears its own fill.
            style={[styles.segment, shown && segment === 0 ? styles.selected : null]}
          >
            {shown ? <Icon name="check" size={18} color={theme.color.focus} /> : option.icon ? <Icon name={option.icon} size={18} color={ink} /> : null}
            <AppText variant={shown ? 'labelStrong' : 'label'} color={ink} numberOfLines={1}>
              {option.label}
            </AppText>
          </Tappable>
        );
      })}
    </Organic>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    track: { flexDirection: 'row', gap: GAP, padding: INSET, alignSelf: 'stretch', backgroundColor: t.color.track, ...corners(SHAPES.track) },
    segment: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, ...corners(SHAPES.segment) },
    selected: { backgroundColor: t.color.paper, boxShadow: t.lift.card },
    pebble: { position: 'absolute', left: 0, top: INSET, bottom: INSET, ...corners(SHAPES.segment), backgroundColor: t.color.paper, boxShadow: t.lift.card },
  });

export const Segmented = memo(SegmentedComponent) as typeof SegmentedComponent;
