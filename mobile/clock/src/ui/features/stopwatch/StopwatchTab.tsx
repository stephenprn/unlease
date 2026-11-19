/**
 * « Chronomètre »: the time large in Signika (minutes and seconds at 72, the hundredths at half that in
 * the second ink, all in tabular figures so nothing shifts as they turn), the lap under way under it;
 * the laps, newest first, each its own time and the whole time at its end, the fastest and the slowest
 * named once there are three; and in the thumb's reach, two large buttons: « Tour » (running) or
 * « Réinitialiser » (paused), and « Démarrer », « Pause » or « Reprendre ». The engine keeps it: it
 * counts on with the app closed, its notification and its widget showing it. A new lap slides in from
 * the time (250 decelerate; Reduce Motion: it appears).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, Keyframe, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { getLocale, t, tc } from '@unlease/core/i18n';
import { currentLap, elapsed, isReset, isRunning, lapRows, type LapRow } from '@unlease/clock/models/stopwatch';
import { stopwatchClock, stopwatchParts, stopwatchSentence } from '@unlease/clock/services/timers';
import { useFrameTime } from '@app/hooks/useTick';
import { lapStopwatch, pauseStopwatch, resetStopwatch, startStopwatch, useToolsStore } from '@app/store/toolsStore';
import { AppText, Button, EdgeFlatList } from '@shared/ui/components';
import { decelerate, duration, standard } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

import { RollingFigure } from './RollingFigure';
import { StopwatchDial } from './StopwatchDial';

/** A new lap slides down out of the time, settling (250 decelerate). */
const LAP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -12 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
/** Its bar grows from its start to its length, a beat after the row arrives. */
const BAR_IN = new Keyframe({ 0: { transform: [{ scaleX: 0 }] }, 100: { transform: [{ scaleX: 1 }], easing: decelerate } }).duration(duration.long).delay(duration.beat);
/** The dial's size with laps, as a share of its size alone. */
const WITH_LAPS = 260 / 312;
/** The face's room around the dial (its paddings), and the room between the two buttons. */
const FACE_ROOM = 28;
const BUTTON_GAP = 12;

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
          <Animated.View entering={still || row.number !== total ? undefined : BAR_IN} style={[styles.bar, { width: `${Math.max(4, Math.round((row.lap / Math.max(1, longest)) * 100))}%`, backgroundColor: row.fastest ? theme.color.focus : row.slowest ? theme.color.waiting : theme.color.action, opacity: row.fastest || row.slowest ? 1 : 0.55 }]} />
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
  const still = useReducedMotion();
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
  const dial = Math.min(width - 72, 312);
  const hasLaps = rows.length > 0;
  // An hour on: three groups in the room two had.
  const long = main.length > 5;

  // With laps, the dial gives them room: it shrinks and rises from the screen's heart to the top, both
  // one state change (300, standard); reset, it comes back. Alone, the face is lowered to the middle of
  // the room it has (measured), never laid out anew, so nothing jumps.
  const scale = useSharedValue(hasLaps ? WITH_LAPS : 1);
  const [stage, setStage] = useState(0);
  const lowered = hasLaps ? 0 : Math.max(0, (stage - (dial + FACE_ROOM)) / 2 - 24);
  const lower = useSharedValue(lowered);
  useEffect(() => {
    const to = hasLaps ? WITH_LAPS : 1;
    scale.value = still ? to : withTiming(to, { duration: duration.long, easing: standard });
    lower.value = still ? lowered : withTiming(lowered, { duration: duration.long, easing: standard });
  }, [hasLaps, lowered, still, scale, lower]);
  const frame = useAnimatedStyle(() => ({ width: dial, height: dial * scale.value }));
  const shrink = useAnimatedStyle(() => ({ transform: [{ translateY: -(dial * (1 - scale.value)) / 2 }, { scale: scale.value }] }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: lower.value }] }));

  // « Démarrer » alone at zero; started, it narrows to its half and becomes « Pause » as « Tour » settles in beside it.
  const two = running || !reset;
  // The second button's word: « Tour » running, « Réinitialiser » paused, kept as it fades away.
  const [secondKind, setSecondKind] = useState<'lap' | 'reset'>(running || reset ? 'lap' : 'reset');
  const wanted = running ? 'lap' : 'reset';
  if (two && wanted !== secondKind) setSecondKind(wanted);
  const split = useSharedValue(two ? 1 : 0);
  useEffect(() => {
    split.value = still ? (two ? 1 : 0) : withTiming(two ? 1 : 0, { duration: duration.long, easing: standard });
  }, [two, still, split]);
  const [row, setRow] = useState(0);
  const half = (row - BUTTON_GAP) / 2;
  const first = useAnimatedStyle(() => ({ width: row - (row - half) * split.value }));
  const second = useAnimatedStyle(() => ({ width: half, opacity: split.value, transform: [{ scale: 0.94 + 0.06 * split.value }] }));

  return (
    <View style={styles.fill}>
      <View style={styles.fill} onLayout={event => setStage(event.nativeEvent.layout.height)}>
        <Animated.View style={[styles.face, face]} accessible accessibilityRole="timer" accessibilityLabel={reset ? t('Stopwatch at zero') : stopwatchSentence(total)}>
          <Animated.View style={frame}>
            <Animated.View style={shrink}>
              <StopwatchDial size={dial} watch={watch} active={active}>
                <View style={[styles.figure, { maxWidth: dial - 64 }]}>
                  <RollingFigure text={main} lineHeight={long ? 62 : 74} style={[styles.main, long && styles.mainLong, !running && !reset && styles.held]} />
                  <AppText style={[styles.hundredths, !running && !reset && styles.heldHundredths]}>{`${getLocale() === 'fr' ? ',' : '.'}${hundredths}`}</AppText>
                </View>
                {watch.laps.length > 0 ? (
                  <Animated.View entering={still ? undefined : FadeIn.duration(duration.medium).delay(duration.beat)}>
                    <AppText variant="bodyStrong" color={theme.color.inkMuted} style={styles.lapNow}>
                      {`${t('Lap {number}', { number: watch.laps.length + 1 })} · ${stopwatchClock(lap)}`}
                    </AppText>
                  </Animated.View>
                ) : null}
              </StopwatchDial>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        {hasLaps ? (
          <Animated.View entering={still ? undefined : FadeIn.duration(duration.medium).delay(duration.medium)} style={styles.fill}>
            <EdgeFlatList
              data={rows}
              keyExtractor={row => String(row.number)}
              renderItem={({ item }) => <LapLine row={item} total={watch.laps.length} longest={longest} />}
              ItemSeparatorComponent={() => <View style={styles.rule} />}
              style={styles.fill}
              contentContainerStyle={styles.laps}
            />
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingBottom: bottom + 16 }]}>
        <View style={styles.buttons} onLayout={event => setRow(event.nativeEvent.layout.width)}>
          {/* « Tour » running, « Réinitialiser » paused: still there (fading) as it leaves. */}
          <Animated.View style={[styles.second, second]} pointerEvents={two ? 'auto' : 'none'} accessibilityElementsHidden={!two} importantForAccessibility={two ? 'auto' : 'no-hide-descendants'}>
            {secondKind === 'lap' ? <Button kind="tonal" icon="flag" label={t('Lap')} onPress={() => lapStopwatch()} style={styles.button} /> : <Button kind="tonal" icon="restore" label={t('Reset')} onPress={resetStopwatch} style={styles.button} />}
          </Animated.View>
          <Animated.View style={[styles.first, row > 0 ? first : null]}>
            {running ? <Button icon="pause" label={t('Pause')} onPress={() => pauseStopwatch()} style={styles.button} /> : <Button icon="go" label={reset ? tc('timer', 'Start') : t('Resume')} onPress={() => startStopwatch()} style={styles.button} />}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    face: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, paddingHorizontal: 16 },
    figure: { flexDirection: 'row', alignItems: 'baseline' },
    main: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 64, lineHeight: 74, letterSpacing: -1.5, color: theme.color.ink, fontVariant: ['tabular-nums'] },
    mainLong: { fontSize: 52, lineHeight: 62, letterSpacing: -1 },
    // Held (paused): the second ink, as a timer paused reads.
    held: { color: theme.color.inkMuted },
    heldHundredths: { color: theme.color.inkFaint },
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
    actions: { paddingHorizontal: 16, paddingTop: 12 },
    // One row, 64 high: the first button at its end, the second at its start.
    buttons: { height: 64, flexDirection: 'row', justifyContent: 'flex-end' },
    first: { height: 64, width: '100%' },
    second: { position: 'absolute', left: 0, top: 0, height: 64 },
    button: { minHeight: 64, alignSelf: 'stretch' },
  });
}
