/**
 * A world clock, as an alarm's card: its time at 34 in Signika (in the accent's ink while the ruler
 * points away from now), the city's name over « Demain · +8 h », and the sun or the moon as it is
 * there, its card lit from that side by the light there (Safran by day, the accent at dusk, none at
 * night). A press opens it (rename, remove). TalkBack hears it as one sentence.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { cityMeta, clockIn, clockSentence, daylight, wallIn } from '@unlease/clock/services/worldClocks';
import { dayShare } from '@unlease/design/waves';
import { AppText, Organic, Tappable } from '@shared/ui/components';
import { withAlpha } from '@unlease/design/color';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

import { MiniDayWave } from './DayWave';

interface Props {
  readonly clock: WorldClock;
  /** The moment shown: now, or where the ruler points. */
  readonly at: number;
  readonly shifted: boolean;
  readonly twelveHours: boolean;
  readonly onOpen: (id: string) => void;
}

function CityCardComponent({ clock, at, shifted, twelveHours, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const sky = daylight(clock, at);
  const light = sky === 'day' ? theme.color.waiting : theme.color.action;
  return (
    <Organic outline="card" style={styles.card}>
      {/* Its own daylight, from the sun's side of the card: warm by day, the accent's at dusk, none at night. */}
      {sky === 'night' ? null : (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundImage: `radial-gradient(circle at 96% 50%, ${withAlpha(light, theme.mode === 'dark' ? 0.22 : 0.18)} 0%, ${withAlpha(light, 0)} 62%)` }]}
        />
      )}
      <Tappable outline="card" onPress={() => onOpen(clock.id)} accessibilityRole="button" accessibilityHint={t('Opens the city')} accessibilityLabel={clockSentence(clock, at, twelveHours)} style={styles.row}>
        <AppText style={[styles.time, shifted && { color: theme.color.action }]} numberOfLines={1} adjustsFontSizeToFit>
          {clockIn(clock.zone, at, twelveHours)}
        </AppText>
        <View style={styles.words}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {clock.name}
          </AppText>
          <AppText variant="meta" numberOfLines={1} style={styles.meta}>
            {cityMeta(clock.zone, at)}
          </AppText>
        </View>
        <MiniDayWave share={dayShare(wallIn(clock.zone, at))} light={sky} />
      </Tappable>
    </Organic>
  );
}

export const CityCard = memo(CityCardComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 20, paddingRight: 18, paddingVertical: 12, minHeight: 76 },
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: theme.color.ink, fontVariant: ['tabular-nums'], minWidth: 92 },
    words: { flex: 1, gap: 1 },
    meta: { fontVariant: ['tabular-nums'] },
  });
}
