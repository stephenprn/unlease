/**
 * « Horloges »: here first, large (the time at 56 in Signika, the day and this phone's city), then the
 * ruler that compares the hours (`TimeRuler`): slid, every card below shows its city's time at that
 * moment and the time here turns to the accent with « Maintenant » to come back; then a card per city,
 * west to east as a day travels (`CityCard`). The capture pebble adds a city. No city yet, the place
 * says what a world clock is for.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { clockWords, dayTitle } from '@unlease/calendar/services/eventText';
import { deviceZone, instantToWall } from '@unlease/calendar/services/time';
import { atHereWords, liveWorldClocks, offsetWords, shiftedMoment, zoneCityName } from '@unlease/clock/services/worldClocks';
import { useTick } from '@app/hooks/useTick';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { AppText, Button, EdgeScrollView, EmptyLine, FAB_CLEARANCE } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

import { CityCard } from './CityCard';
import { DayWave } from './DayWave';
import { TimeRuler } from './TimeRuler';

interface Props {
  readonly bottom: number;
  /** The place shown: hidden, its time stands still. */
  readonly active: boolean;
  /** A city pressed: its sheet opens over the whole screen (the home's), never under its bar. */
  readonly onOpen: (id: string) => void;
}

export function WorldTab({ bottom, active, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const prefs = useClockUiStore(selectPrefs);
  const clocks = useLibraryStore(state => state.worldClocks);
  const now = useTick(60_000, active);
  const [shift, setShift] = useState(0);
  const at = shiftedMoment(now, shift);
  const list = useMemo(() => liveWorldClocks(clocks, now), [clocks, now]);
  const here = useMemo(() => zoneCityName(deviceZone()), []);
  const wall = instantToWall(at, '');
  const shifted = shift !== 0;

  return (
    <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + FAB_CLEARANCE }]}>
      <View style={styles.here} accessible accessibilityLiveRegion="polite" accessibilityLabel={[shifted ? atHereWords(at, prefs.twelveHours) : clockWords(wall.slice(11, 16), prefs.twelveHours), dayTitle(wall.slice(0, 10)), here].join(', ')}>
        <AppText style={[styles.time, shifted && { color: theme.color.action }]} numberOfLines={1}>
          {clockWords(wall.slice(11, 16), prefs.twelveHours)}
        </AppText>
        <AppText variant="bodyStrong" color={theme.color.inkMuted} numberOfLines={1}>
          {`${dayTitle(wall.slice(0, 10))} · ${here}`}
        </AppText>
      </View>

      <DayWave clocks={list} at={at} width={width} twelveHours={prefs.twelveHours} active={active} />

      <View style={styles.compare}>
        {/* Slid: how far from now, and the way back; at rest, nothing: the ruler says what it is. */}
        <View style={styles.compareHead}>
          {shifted ? (
            <>
              <AppText variant="metaStrong" color={theme.color.action} numberOfLines={1} style={styles.compareWords}>
                {t('{gap} from now', { gap: offsetWords(shift) })}
              </AppText>
              <Button kind="text" small label={t('Now')} onPress={() => setShift(0)} />
            </>
          ) : null}
        </View>
        <TimeRuler now={now} shift={shift} onShift={setShift} twelveHours={prefs.twelveHours} width={width} />
      </View>

      {list.length > 0 ? (
        <View style={styles.list}>
          {list.map(clock => (
            <CityCard key={clock.id} clock={clock} at={at} shifted={shifted} twelveHours={prefs.twelveHours} onOpen={onOpen} />
          ))}
        </View>
      ) : (
        <EmptyLine glyph="globe" text={t('The + button adds a city: a friend’s, a trip’s, your office’s. Its time, day or night there, and how far ahead it is.')} style={styles.empty} />
      )}
    </EdgeScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    content: { paddingTop: 4 },
    here: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 16 },
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 72, lineHeight: 80, letterSpacing: -1.5, color: theme.color.ink, fontVariant: ['tabular-nums'] },
    compare: { marginBottom: 8 },
    compareHead: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 28, gap: 8 },
    compareWords: { flex: 1, fontVariant: ['tabular-nums'] },
    list: { paddingHorizontal: 12, gap: 8, marginTop: 8 },
    empty: { marginHorizontal: 28, marginTop: 16 },
  });
}
