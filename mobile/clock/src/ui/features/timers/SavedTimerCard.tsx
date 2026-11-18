/**
 * A saved timer, as an alarm's card: its length as a figure (`LengthFigure`), its label (« En cours »
 * under it in link ink while one of it runs), and at its end the start button, the primary's
 * pebble holding the start glyph: one tap starts it, the card itself opens its form.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Timer } from '@unlease/clock/models/timer';
import { lengthSentence, lengthWords } from '@unlease/clock/services/timers';
import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { LengthFigure } from './LengthFigure';

interface Props {
  readonly timer: Timer;
  /** How many runs of it are under way. */
  readonly running: number;
  readonly onOpen: (id: string) => void;
  readonly onStart: (timer: Timer) => void;
}

function SavedTimerCardComponent({ timer, running, onOpen, onStart }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const label = timer.label.trim();
  const length = lengthWords(timer.seconds);
  const name = label || length;
  return (
    <Organic outline="card" style={styles.card}>
      <Tappable outline="card" onPress={() => onOpen(timer.id)} accessibilityRole="button" accessibilityHint={t('Opens the timer')} accessibilityLabel={[label, lengthSentence(timer.seconds), running > 0 ? t('Under way') : ''].filter(Boolean).join(', ')} style={styles.row}>
        <LengthFigure seconds={timer.seconds} size={32} style={styles.length} />
        <View style={styles.words}>
          {label ? (
            <AppText variant="bodyStrong" numberOfLines={1}>
              {label}
            </AppText>
          ) : null}
          {running > 0 ? (
            <AppText variant="meta" color={theme.color.link} numberOfLines={1}>
              {t('Under way')}
            </AppText>
          ) : null}
        </View>
        <Tappable pebble={2} onFill onPress={() => onStart(timer)} accessibilityRole="button" accessibilityLabel={t('Start {name}', { name })} style={styles.start}>
          <Icon name="go" size={24} color={theme.color.onActionContainer} />
        </Tappable>
      </Tappable>
    </Organic>
  );
}

export const SavedTimerCard = memo(SavedTimerCardComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 20, paddingRight: 12, paddingVertical: 12, minHeight: 76 },
    length: { minWidth: 104 },
    words: { flex: 1, gap: 1 },
    // The start: the primary's pebble, 52 by 48, as the capture pebble a step smaller.
    start: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.actionContainer },
  });
}
