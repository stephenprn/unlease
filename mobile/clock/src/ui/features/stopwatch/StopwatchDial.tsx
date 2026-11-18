/**
 * The stopwatch's face: a bezel of sixty ticks around its figure, as a stopwatch is drawn, every fifth
 * longer. As a minute runs, the ticks behind the hand light up in the accent, one a second, and a dot
 * sweeps round as the seconds hand; the minute done, the bezel empties and fills again. Paused, it
 * holds; at zero, every tick is quiet and the bead waits at the top. The figure sits at its heart.
 * Ticks redraw once a second (`lit`); only the hand moves each frame.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@shared/ui/theme/ThemeProvider';

const TICKS = 60;

interface TicksProps {
  readonly size: number;
  /** How many ticks are lit (the seconds of the minute under way). */
  readonly lit: number;
}

/** The sixty ticks, laid round the face. */
const Ticks = memo(function Ticks({ size, lit }: TicksProps) {
  const theme = useTheme();
  const radius = size / 2;
  return (
    <>
      {Array.from({ length: TICKS }, (_, index) => {
        const major = index % 5 === 0;
        const length = major ? 16 : 9;
        const on = index < lit;
        return (
          <View
            key={index}
            style={[
              styles.tick,
              {
                width: major ? 3 : 2,
                height: length,
                left: radius - (major ? 1.5 : 1),
                top: radius - length / 2,
                backgroundColor: on ? theme.color.action : major ? theme.color.inkFaint : theme.color.edge,
                opacity: on || major ? 1 : 0.55,
                transform: [{ rotate: `${(index / TICKS) * 360}deg` }, { translateY: -(radius - length / 2 - 2) }],
              },
            ]}
          />
        );
      })}
    </>
  );
});

interface Props {
  readonly size: number;
  /** Milliseconds counted. */
  readonly elapsed: number;
  readonly running: boolean;
  readonly children: React.ReactNode;
}

function StopwatchDialComponent({ size, elapsed, running, children }: Props) {
  const theme = useTheme();
  const inMinute = elapsed % 60_000;
  const lit = elapsed === 0 ? 0 : Math.floor(inMinute / 1000) + 1;
  const angle = (inMinute / 60_000) * 360;
  const radius = size / 2;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ticks size={size} lit={lit} />
      {/* The seconds hand: a bead riding on the ticks' ring, ahead of the lit ones, clear of the figure. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]}>
        <View style={[styles.hand, { left: radius - 7, top: 3, backgroundColor: running ? theme.color.action : theme.color.inkMuted, borderColor: theme.color.wall }]} />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.heart]}>{children}</View>
    </View>
  );
}

export const StopwatchDial = memo(StopwatchDialComponent);

const styles = StyleSheet.create({
  tick: { position: 'absolute', borderRadius: 1.5 },
  hand: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  heart: { alignItems: 'center', justifyContent: 'center' },
});
