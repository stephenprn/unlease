/**
 * A timer's window (`timerWindow` in index.js; `tools/TimerRingActivity` shows it over the lock screen,
 * turning the screen on, as a timer ends). What it serves: someone across the kitchen, hands full. So
 * the night theme on the night ground like the alarm's window, the hourglass and « Temps écoulé », the
 * timer's name, the time since its end counting up at 96 in the accent, and two large buttons in the
 * thumb's reach (the hourglass turning over on the accent's pebble, its echoes rippling out, `RingBeacon`; a warm light at the foot, `Dawn`): « +1 min » (tonal) and « Arrêter » (filled, 72 high: a timer is stopped at once, no
 * slide to guard it, unlike an alarm a sleepy hand might stop). Several ringing: each named, « Tout
 * arrêter ». The sound and the notification are the engine's: this window draws and answers, and
 * closes once nothing rings, wherever that was done.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { overtime, type TimerRun } from '@unlease/clock/models/timer';
import { overtimeClock, runName } from '@unlease/clock/services/timers';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';

import { AppText, Button, Ground } from '@shared/ui/components';
import { decelerate } from '@shared/ui/theme/motion';
import { ThemeProvider, useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { onTools, readTools, stopRingingTimers, timerAction, type ToolsState } from '@platform/tools';

import { bootstrap } from '@app/bootstrap';
import { useTick } from '@app/hooks/useTick';

import { Dawn } from './Dawn';
import { RingBeacon } from './RingBeacon';

/** What rings settles in from a little below (600 decelerate), once. */
const ARRIVE = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 18 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(600);

function readRinging(state: ToolsState): TimerRun[] {
  try {
    const runs = JSON.parse(state.timers) as (TimerRun & { readonly silenced?: boolean })[];
    return runs.filter(run => run.state === 'ringing' && !run.silenced).sort((a, b) => a.endsAt - b.endsAt);
  } catch {
    return [];
  }
}

/** The timers ringing now, as the engine says them, followed. */
function useRinging(): TimerRun[] {
  const [ringing, setRinging] = useState<TimerRun[]>([]);
  useEffect(() => {
    let live = true;
    readTools().then(state => live && setRinging(readRinging(state)), () => undefined);
    const subscription = onTools(state => setRinging(readRinging(state)));
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return ringing;
}

export default function TimerRoot(): React.ReactElement {
  // Booted for the language; should it fail, the window still answers, which only needs the engine.
  useState(bootstrap);
  return (
    <ThemeProvider mode="dark">
      <SafeAreaProvider>
        <TimerWindow />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function TimerWindow(): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ringing = useRinging();
  const still = useReducedMotion();
  const now = useTick(1000, ringing.length > 0);
  const first = ringing[0];
  const names = useMemo(() => ringing.map(runName), [ringing]);

  // Back leaves nothing: the timer is answered here, from its notification, or with a volume key.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const one = ringing.length <= 1;
  return (
    <View style={styles.screen}>
      <Ground />
      {/* A warm light at the foot, steady: the timer's window is the alarm's, without its dawn. */}
      <Dawn rising={false} />
      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.above} />
        <Animated.View entering={still ? undefined : ARRIVE} style={styles.head} accessible accessibilityRole="header" accessibilityLabel={[t('Time’s up'), ...names].join(', ')}>
          <RingBeacon glyph="timer" motion="turn" active={ringing.length > 0} />
          <AppText variant="title" style={[styles.center, styles.title]}>
            {one ? t('Time’s up') : t('{count} timers done', { count: ringing.length })}
          </AppText>
          <AppText style={styles.time} adjustsFontSizeToFit numberOfLines={1}>
            {first ? overtimeClock(overtime(first, now)) : ' '}
          </AppText>
          {names.map((name, index) => (
            <AppText key={ringing[index]!.id} variant={index === 0 ? 'title' : 'bodyStrong'} color={index === 0 ? theme.color.ink : theme.color.inkMuted} style={styles.center} numberOfLines={2}>
              {name}
            </AppText>
          ))}
        </Animated.View>
        <View style={styles.below} />
        <View style={styles.actions}>
          {one && first ? <Button kind="tonal" label={t('+1 min')} accessibilityLabel={t('One more minute')} onPress={() => timerAction(first.id, 'add')} style={styles.more} /> : null}
          <Button icon="stop" label={one ? t('Stop') : t('Stop all')} onPress={() => (one && first ? timerAction(first.id, 'stop') : stopRingingTimers())} style={styles.stop} />
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { flex: 1, paddingHorizontal: 24 },
    above: { flexGrow: 2, maxHeight: '18%' },
    head: { alignItems: 'center', gap: 6 },
    center: { textAlign: 'center' },
    title: { marginTop: 24 },
    // The time since its end, the one figure to read from across the room: in the accent, as it asks for an answer.
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 96, lineHeight: 108, letterSpacing: -2, color: theme.color.action, textAlign: 'center', fontVariant: ['tabular-nums'], alignSelf: 'stretch' },
    below: { flexGrow: 3, minHeight: 24 },
    actions: { gap: 14 },
    more: { minHeight: 64, alignSelf: 'stretch' },
    stop: { minHeight: 72, alignSelf: 'stretch' },
  });
}
