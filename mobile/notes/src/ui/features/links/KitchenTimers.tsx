/**
 * The kitchen's timers (`@app/store/kitchen`), the soonest first: each counts down to the second and
 * stops in one press; a rung one turns peach and says so until it is dismissed. Shown in the cook
 * mode and on a recipe's page; a timer started for another recipe names it. Each also rings through
 * a notification, heard with the phone locked, and once on a slip wherever the app is.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatCountdown } from '@unlease/notes/services/recipes';
import { useLibraryStore } from '@app/store/libraryStore';
import { ringTimer, selectTimers, stopTimer, useKitchenStore, type KitchenTimer } from '@app/store/kitchen';
import { showSnack } from '@app/store/uiStore';

import { AppText, Icon, IconButton, Organic } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

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
      showSnack(t('Minuteur terminé : {label}', { label: timer.label }), undefined, { tone: 'warning' });
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
    <View style={styles.tray} accessibilityLabel={t('Minuteurs')}>
      {timers.map(timer => (
        <TimerRow key={timer.id} timer={timer} now={now} other={timer.linkId !== linkId} />
      ))}
    </View>
  );
}

const TimerRow = memo(function TimerRowView({ timer, now, other }: { timer: KitchenTimer; now: number; other: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const recipe = useLibraryStore(s => (other ? (s.links[timer.linkId]?.title ?? '') : ''));
  const rung = timer.endsAt <= now;
  return (
    <Organic outline="card" style={[styles.timer, rung ? styles.rung : styles.running]}>
      <Icon name={rung ? 'bell' : 'clock'} size={22} color={theme.color.ink} />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {timer.label}
        </AppText>
        {recipe ? (
          <AppText variant="meta" color={rung ? theme.color.ink : undefined} numberOfLines={1}>
            {recipe}
          </AppText>
        ) : null}
      </View>
      {rung ? (
        <AppText variant="title" accessibilityLiveRegion="polite">
          {t('Terminé')}
        </AppText>
      ) : (
        <AppText variant="title">{formatCountdown((timer.endsAt - now) / 1000)}</AppText>
      )}
      <IconButton icon={rung ? 'check' : 'close'} label={rung ? t('Fermer le minuteur') : t('Arrêter le minuteur')} onPress={() => stopTimer(timer.id)} />
    </Organic>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tray: { gap: 8 },
    timer: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 4, paddingVertical: 6 },
    running: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    // Rung: the peach that marks what needs the eye, until it is dismissed.
    rung: { backgroundColor: theme.color.highlight, boxShadow: theme.lift.raised },
    text: { flex: 1, gap: 2 },
  });
