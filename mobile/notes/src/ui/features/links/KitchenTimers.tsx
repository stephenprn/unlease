/**
 * The kitchen's timers (`@app/store/kitchen`), the soonest first, as pills of the slip (the web's
 * `TimerPill`): each counts down to the second and stops in one press; a rung one turns `waiting`,
 * pulses three times and says so until it is dismissed. Shown in the cook mode and on a recipe's
 * page; a timer started for another recipe names it. Each also rings through a notification, heard
 * with the phone locked, and once on a slip wherever the app is.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { formatCountdown } from '@unlease/notes/services/recipes';
import { useLibraryStore } from '@app/store/libraryStore';
import { ringTimer, selectTimers, stopTimer, useKitchenStore, type KitchenTimer } from '@app/store/kitchen';
import { showSnack } from '@shared/app/store/uiStore';

import { AnimatedOrganic, AppText, Icon, IconButton } from '../../components';
import { standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** The time, every second while `active`. */
function useSecond(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Mounted once with the app's overlays: a timer that ends rings at once and says so on a slip, on any screen (its notification may be refused). */
export function KitchenAlarms(): null {
  const timers = useKitchenStore(selectTimers);
  const now = useSecond(timers.length > 0);
  const rung = useRef(new Set<string>());
  useEffect(() => {
    for (const timer of timers) {
      if (timer.endsAt > now || rung.current.has(timer.id)) continue;
      rung.current.add(timer.id);
      ringTimer(timer);
      showSnack(t('Timer done: {label}', { label: timer.label }), undefined, { tone: 'warning' });
    }
  }, [timers, now]);
  return null;
}

/** `linkId`: the recipe on screen; the others' timers say which recipe they time. */
export function KitchenTimers({ linkId }: { linkId: string }) {
  const styles = useThemedStyles(makeStyles);
  const timers = useKitchenStore(selectTimers);
  const now = useSecond(timers.length > 0);
  if (timers.length === 0) return null;
  return (
    <View style={styles.tray} accessibilityLabel={t('Timers')}>
      {timers.map(timer => (
        <TimerRow key={timer.id} timer={timer} now={now} other={timer.linkId !== linkId} />
      ))}
    </View>
  );
}

/** A rung pill's pulse: three breaths to 1.04 and back (the web's `timer-rung`), none under Reduce Motion. */
const PULSE = { scale: 1.04, half: 600, times: 3 } as const;

/** One timer on the slip: what it times (and for which recipe, when not this one), the time left or « Terminé », its stop. */
const TimerRow = memo(function TimerRowView({ timer, now, other }: { timer: KitchenTimer; now: number; other: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const recipe = useLibraryStore(s => (other ? (s.links[timer.linkId]?.title.trim() ?? '') : ''));
  const rung = timer.endsAt <= now;
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!rung || reduced) return;
    scale.value = withRepeat(withSequence(withTiming(PULSE.scale, { duration: PULSE.half, easing: standard }), withTiming(1, { duration: PULSE.half, easing: standard })), PULSE.times);
    return () => cancelAnimation(scale);
  }, [rung, reduced, scale]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Rung: it waits in the warning's tone, in ink, until it is dismissed.
  const ink = rung ? theme.color.ink : theme.color.onSlip;
  return (
    <AnimatedOrganic style={[styles.pill, rung ? styles.rung : null, pulse]}>
      <Icon name="clock" size={18} color={ink} />
      <View style={styles.what}>
        <AppText variant="label" color={ink} numberOfLines={1}>
          {timer.label}
        </AppText>
        {recipe ? (
          <AppText variant="meta" color={rung ? theme.color.ink : theme.color.onSlipMuted} numberOfLines={1}>
            {recipe}
          </AppText>
        ) : null}
      </View>
      <AppText variant="label" color={ink} style={styles.left} accessibilityLiveRegion={rung ? 'polite' : undefined}>
        {rung ? t('Done') : formatCountdown((timer.endsAt - now) / 1000)}
      </AppText>
      <IconButton icon="close" onDark={!rung} label={rung ? t('Dismiss the timer') : t('Stop the timer')} onPress={() => stopTimer(timer.id)} />
    </AnimatedOrganic>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tray: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
    // A pill of the slip in the chip's radius; its stop keeps its 48 target, 4 clear of the pill's edges.
    pill: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, backgroundColor: theme.color.slip, ...corners(SHAPES.chip) },
    rung: { backgroundColor: theme.color.waiting },
    what: { flexShrink: 1, minWidth: 0 },
    // The time left keeps its room as its digits change (Signika's figures are tabular).
    left: { minWidth: 44 },
  });
