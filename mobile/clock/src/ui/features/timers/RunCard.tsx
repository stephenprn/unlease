/**
 * A timer that runs, on its paper panel: its name and when it ends (« Fin à 14:32 »), the time left
 * large in Signika (the second ink while paused), a track filling in the primary as it goes, then its
 * actions in the thumb's reach: « Pause » or « Reprendre » (filled), « +1 min » (tonal), and, paused,
 * « Réinitialiser ». Ringing, it says « Temps écoulé » in the accent and counts the time since its end
 * (« −0:12 »), with « Arrêter » and « +1 min ». × at its head deletes it. The countdown ticks each
 * second on the second's edge; the track glides between ticks (Reduce Motion: it steps).
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';
import { instantToWall } from '@unlease/calendar/services/time';
import { overtime, progress, remaining, type TimerRun } from '@unlease/clock/models/timer';
import { countdownClock, lengthSentence, lengthWords, overtimeClock } from '@unlease/clock/services/timers';
import { AppText, Button, IconButton, Organic } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { SHAPES } from '@unlease/design/shapes';
import { actOnTimer } from '@app/store/toolsStore';

interface Props {
  readonly run: TimerRun;
  readonly now: number;
  readonly twelveHours: boolean;
}

function RunCardComponent({ run, now, twelveHours }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const still = useReducedMotion();
  const ringing = run.state === 'ringing';
  const paused = run.state === 'paused';
  const left = remaining(run, now);
  const share = progress(run, now);
  const fill = useSharedValue(share);
  useEffect(() => {
    // The next second's share, reached as that second ends: the track never stops between ticks.
    const ahead = run.state === 'running' ? progress(run, now + 1000) : share;
    fill.value = still || run.state !== 'running' ? withTiming(share, { duration: still ? 0 : 150 }) : withTiming(ahead, { duration: 1000, easing: Easing.linear });
  }, [share, now, run, still, fill]);
  const track = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 1000) / 10}%` }));

  // Its label, else what it was set for (« 5 min »): never « Minuteur de 5 min » under the timers' own name.
  const name = run.label.trim() || lengthWords(run.length / 1000);
  const time = ringing ? overtimeClock(overtime(run, now)) : countdownClock(left);
  const ends = clockWords(instantToWall(run.endsAt, '').slice(11, 16), twelveHours);
  const meta = ringing ? t('Time’s up') : paused ? t('Paused') : t('Ends at {time}', { time: ends });
  const said = ringing ? t('{name}: time’s up', { name }) : t('{name}: {left} left', { name, left: lengthSentence(Math.ceil(left / 1000)) });

  return (
    <Organic outline="panel" style={[styles.panel, ringing && styles.ringing]}>
      <View style={styles.head}>
        <View style={styles.words}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="meta" color={ringing ? theme.color.action : theme.color.inkMuted} numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        {ringing ? null : <IconButton icon="close" label={t('Delete the timer')} onPress={() => actOnTimer(run.id, 'delete')} />}
      </View>
      <AppText style={[styles.time, paused && styles.paused, ringing && styles.over]} accessibilityLabel={said} accessibilityLiveRegion={ringing ? 'assertive' : 'none'} numberOfLines={1} adjustsFontSizeToFit>
        {time}
      </AppText>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fill, ringing && styles.fillDone, track]} />
      </View>
      <View style={styles.actions}>
        {ringing ? (
          <>
            <Button kind="tonal" label={t('+1 min')} accessibilityLabel={t('One more minute')} onPress={() => actOnTimer(run.id, 'add')} style={styles.action} />
            <Button icon="stop" label={t('Stop')} onPress={() => actOnTimer(run.id, 'stop')} style={styles.action} />
          </>
        ) : (
          <>
            {paused && left < run.total ? <Button kind="text" icon="restore" label={t('Reset')} onPress={() => actOnTimer(run.id, 'reset')} /> : null}
            <Button kind="tonal" label={t('+1 min')} accessibilityLabel={t('One more minute')} onPress={() => actOnTimer(run.id, 'add')} style={styles.action} />
            <Button icon={paused ? 'go' : 'pause'} label={paused ? t('Resume') : t('Pause')} onPress={() => actOnTimer(run.id, paused ? 'resume' : 'pause')} style={styles.action} />
          </>
        )}
      </View>
    </Organic>
  );
}

export const RunCard = memo(RunCardComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    panel: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, paddingTop: 8, paddingBottom: 16 },
    // Ringing: its edge in the accent, so it reads from across the kitchen.
    ringing: { borderColor: theme.color.action, borderWidth: 1.5 },
    head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 6, minHeight: 48 },
    words: { flex: 1 },
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 64, lineHeight: 72, letterSpacing: -1.5, color: theme.color.ink, fontVariant: ['tabular-nums'], paddingHorizontal: 20 },
    paused: { color: theme.color.inkMuted },
    over: { color: theme.color.action },
    track: { height: 6, marginHorizontal: 20, marginTop: 6, backgroundColor: theme.color.track, overflow: 'hidden', ...corners(SHAPES.detail) },
    // Time going by, in the accent's warmth; the ring, the accent at full.
    fill: { height: '100%', backgroundColor: theme.color.action, opacity: 0.75 },
    fillDone: { backgroundColor: theme.color.action, opacity: 1 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 16 },
    action: { minWidth: 112 },
  });
}
