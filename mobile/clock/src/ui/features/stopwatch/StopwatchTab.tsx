/**
 * « Chronomètre »: the time large in Signika (minutes and seconds at 72, the hundredths at half that in
 * the second ink, all in tabular figures so nothing shifts as they turn), the lap under way under it;
 * the laps, newest first, each its own time and the whole time at its end, the fastest and the slowest
 * named once there are three; and in the thumb's reach, two large buttons: « Tour » (running) or
 * « Réinitialiser » (paused), and « Démarrer », « Pause » or « Reprendre ». The engine keeps it: it
 * counts on with the app closed, its notification and its widget showing it. A new lap slides in from
 * the time (250 decelerate; Reduce Motion: it appears).
 */
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';

import { getLocale, t, tc } from '@unlease/core/i18n';
import { currentLap, elapsed, isReset, isRunning, lapRows, type LapRow } from '@unlease/clock/models/stopwatch';
import { stopwatchClock, stopwatchParts, stopwatchSentence } from '@unlease/clock/services/timers';
import { useFrameTime } from '@app/hooks/useTick';
import { lapStopwatch, pauseStopwatch, resetStopwatch, startStopwatch, useToolsStore } from '@app/store/toolsStore';
import { AppText, Button, EdgeFlatList } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

import { StopwatchDial } from './StopwatchDial';

/** A new lap slides down out of the time, settling (250 decelerate). */
const LAP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -12 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);

function LapLine({ row, total, longest }: { readonly row: LapRow; readonly total: number; readonly longest: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const still = useReducedMotion();
  const tag = row.fastest ? t('Fastest') : row.slowest ? t('Slowest') : '';
  const said = [t('Lap {number}', { number: row.number }), stopwatchSentence(row.lap), tag].filter(Boolean).join(', ');
  return (
    <Animated.View entering={still || row.number !== total ? undefined : LAP_IN} style={styles.lap} accessible accessibilityLabel={said}>
      <View style={styles.lapName}>
        <AppText variant="label" color={theme.color.inkMuted}>
          {t('Lap {number}', { number: row.number })}
        </AppText>
        {/* Its length against the longest lap: the laps compared at a glance, the fastest and the slowest in their inks. */}
        <View style={styles.barTrack}>
          <View style={[styles.bar, { width: `${Math.max(4, Math.round((row.lap / Math.max(1, longest)) * 100))}%`, backgroundColor: row.fastest ? theme.color.focus : row.slowest ? theme.color.waiting : theme.color.action, opacity: row.fastest || row.slowest ? 1 : 0.55 }]} />
        </View>
        {tag ? (
          <AppText variant="metaStrong" color={row.fastest ? theme.color.focus : theme.color.waiting}>
            {tag}
          </AppText>
        ) : null}
      </View>
      <AppText style={styles.lapTime}>{stopwatchClock(row.lap)}</AppText>
      <AppText variant="meta" style={styles.split}>
        {stopwatchClock(row.split)}
      </AppText>
    </Animated.View>
  );
}

interface Props {
  readonly bottom: number;
  /** The place shown: hidden, nothing redraws (the engine counts on). */
  readonly active: boolean;
}

export function StopwatchTab({ bottom, active }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const watch = useToolsStore(state => state.stopwatch);
  const running = isRunning(watch);
  const reset = isReset(watch);
  const now = useFrameTime(running && active);
  const total = elapsed(watch, now);
  const [main, hundredths] = stopwatchParts(total);
  const rows = useMemo(() => lapRows(watch), [watch]);
  const lap = currentLap(watch, now);
  const longest = useMemo(() => rows.reduce((most, row) => Math.max(most, row.lap), 0), [rows]);
  const { width } = useWindowDimensions();
  const dial = Math.min(width - 72, rows.length > 0 ? 260 : 312);

  return (
    <View style={styles.fill}>
      {/* No lap yet: the figure alone, at the screen's heart; laps push it to the top. */}
      <View style={[styles.face, rows.length === 0 && styles.alone]} accessible accessibilityRole="timer" accessibilityLabel={reset ? t('Stopwatch at zero') : stopwatchSentence(total)}>
        <StopwatchDial size={dial} elapsed={total} running={running}>
        <View style={[styles.figure, { maxWidth: dial - 64 }]}>
          <AppText style={[styles.main, !running && !reset && styles.held]} numberOfLines={1} adjustsFontSizeToFit>
            {main}
          </AppText>
          <AppText style={styles.hundredths}>{`${getLocale() === 'fr' ? ',' : '.'}${hundredths}`}</AppText>
        </View>
        {watch.laps.length > 0 ? (
          <AppText variant="bodyStrong" color={theme.color.inkMuted} style={styles.lapNow}>
            {`${t('Lap {number}', { number: watch.laps.length + 1 })} · ${stopwatchClock(lap)}`}
          </AppText>
        ) : null}
        </StopwatchDial>
      </View>

      {rows.length > 0 ? (
      <EdgeFlatList
        data={rows}
        keyExtractor={row => String(row.number)}
        renderItem={({ item }) => <LapLine row={item} total={watch.laps.length} longest={longest} />}
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        style={styles.fill}
        contentContainerStyle={styles.laps}
      />
      ) : null}

      <View style={[styles.actions, { paddingBottom: bottom + 16 }]}>
        {/* At zero, « Démarrer » alone: a reset of nothing has no place. */}
        {running ? (
          <Button kind="tonal" icon="flag" label={t('Lap')} onPress={() => lapStopwatch()} style={styles.button} />
        ) : reset ? null : (
          <Button kind="tonal" icon="restore" label={t('Reset')} onPress={resetStopwatch} style={styles.button} />
        )}
        {running ? (
          <Button icon="pause" label={t('Pause')} onPress={() => pauseStopwatch()} style={styles.button} />
        ) : (
          <Button icon="go" label={reset ? tc('timer', 'Start') : t('Resume')} onPress={() => startStopwatch()} style={styles.button} />
        )}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    face: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, paddingHorizontal: 16 },
    alone: { flex: 1, justifyContent: 'center', paddingTop: 0, paddingBottom: 48 },
    figure: { flexDirection: 'row', alignItems: 'baseline' },
    main: { flexShrink: 1, fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 64, lineHeight: 74, letterSpacing: -1.5, color: theme.color.ink, fontVariant: ['tabular-nums'] },
    // Held (paused): the second ink, as a timer paused reads.
    held: { color: theme.color.inkMuted },
    hundredths: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: theme.color.inkMuted, fontVariant: ['tabular-nums'], marginLeft: 1, minWidth: 42 },
    lapNow: { fontVariant: ['tabular-nums'], marginTop: 2 },
    laps: { paddingHorizontal: 28, paddingBottom: 12 },
    lap: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 },
    lapName: { flex: 1, gap: 4 },
    barTrack: { height: 4, marginRight: 8 },
    bar: { height: 4, borderRadius: 2 },
    lapTime: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 18, lineHeight: 24, color: theme.color.ink, fontVariant: ['tabular-nums'] },
    split: { fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
    rule: { height: 1, backgroundColor: theme.color.hairline },
    actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    button: { flex: 1, minHeight: 64 },
  });
}
