/**
 * What the home says before anything else, only when it matters:
 * - an alarm ringing or snoozed (its notification refused, or the window closed): on the charcoal
 *   slip, with « Répéter » and « Arrêter »;
 * - something that would keep an alarm from ringing as it should (notifications refused, exact alarms
 *   refused, the window over the lock screen refused, the alarm volume at zero, the battery's
 *   « Restreinte »): one quiet line in Safran, opening Réglages where each is fixed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';
import { instantToWall } from '@unlease/calendar/services/time';
import { withAlpha } from '@unlease/design/color';
import { SHAPES } from '@unlease/design/shapes';
import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { health, NO_RING, onRing, ringing, snooze, stop, type AlarmHealth, type RingState } from '@platform/alarmEngine';

/** What rings now, followed. */
function useRing(): RingState {
  const [ring, setRing] = useState<RingState>(NO_RING);
  useEffect(() => {
    let live = true;
    const read = (): void => {
      ringing().then(state => live && setRing(state), () => undefined);
    };
    read();
    const subscription = onRing(state => setRing(state));
    const back = AppState.addEventListener('change', state => state === 'active' && read());
    return () => {
      live = false;
      subscription?.remove();
      back.remove();
    };
  }, []);
  return ring;
}

/** Whether something keeps alarms from ringing as they should, read again whenever the app comes back. */
function useTrouble(): boolean {
  const [trouble, setTrouble] = useState(false);
  useEffect(() => {
    let live = true;
    const read = (): void => {
      health().then(
        (state: AlarmHealth) => live && setTrouble(!state.notifications || !state.exactAlarms || !state.fullScreen || !state.ringingChannel || state.alarmsMuted || state.volume === 0 || state.backgroundRestricted),
        () => undefined,
      );
    };
    read();
    const back = AppState.addEventListener('change', state => state === 'active' && read());
    return () => {
      live = false;
      back.remove();
    };
  }, []);
  return trouble;
}

/** An action on the charcoal slip, as the slip's own (`Snackbar`): a chip edged in its ink, its label in the slip's matcha. */
function SlipAction({ label, onPress }: { readonly label: string; readonly onPress: () => void }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable onDark hitSlop={4} accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <AppText variant="label" color={theme.color.slipAction}>
        {label}
      </AppText>
    </Tappable>
  );
}

export function HomeStatus({ twelveHours, onFix }: { readonly twelveHours: boolean; readonly onFix: () => void }): React.ReactElement | null {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ring = useRing();
  const trouble = useTrouble();
  const onStop = useCallback(() => stop(), []);
  if (ring.state === 'ringing' || ring.state === 'snoozed') {
    const until = clockWords(instantToWall(ring.until, '').slice(11, 16), twelveHours);
    return (
      <Organic shape={SHAPES.slip} style={styles.slip} accessibilityLiveRegion="polite">
        <Icon name="bell" size={20} color={theme.color.onSlipMuted} />
        <View style={styles.grow}>
          {/* Whole, as the slip's words are: at a large font scale beside two actions, on two lines. */}
          <AppText variant="bodyStrong" color={theme.color.onSlip}>
            {ring.state === 'ringing' ? t('An alarm is ringing') : t('Snoozed until {time}', { time: until })}
          </AppText>
          {ring.title ? (
            <AppText variant="meta" color={theme.color.onSlipMuted} numberOfLines={1}>
              {ring.title}
            </AppText>
          ) : null}
        </View>
        {ring.state === 'ringing' ? <SlipAction label={t('Snooze')} onPress={snooze} /> : null}
        <SlipAction label={t('Stop')} onPress={onStop} />
      </Organic>
    );
  }
  if (!trouble) return null;
  return (
    <Tappable onPress={onFix} style={styles.trouble} accessibilityRole="button" accessibilityLabel={t('An alarm may not ring as it should. Check in Settings.')}>
      <Icon name="alert" size={18} color={theme.color.waiting} />
      <AppText variant="meta" color={theme.color.ink} style={styles.grow}>
        {t('An alarm may not ring as it should.')}
      </AppText>
      <AppText variant="label" color={theme.color.link}>
        {t('Check')}
      </AppText>
    </Tappable>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    slip: { marginHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 6, minHeight: 52, backgroundColor: theme.color.slip, boxShadow: theme.lift.float },
    grow: { flex: 1 },
    // The slip's action chip: 40 high, 6 from the slip's edges, its target 48 with the slop.
    action: { minHeight: 40, marginVertical: 6, paddingHorizontal: 14, justifyContent: 'center', ...corners(SHAPES.chip), borderWidth: 1, borderColor: withAlpha(theme.color.onSlip, 0.22) },
    trouble: { marginHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 48, ...corners(SHAPES.tab) },
  });
}
