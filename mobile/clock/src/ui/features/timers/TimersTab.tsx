/**
 * « Minuteurs »: what runs first, each timer on its card (`RunCard`), a ringing one leading; then the
 * quickest way to start one, the lengths started lately (or the usual ones) as raised figures, one tap each, an
 * instant timer that is gone once it has rung; then the saved timers (`SavedTimerCard`), shortest
 * first, each started from its pebble, opened from its card (titled only when there are some). The capture pebble opens a new timer's
 * form (any length, a label, saved or not). Nothing saved yet, the saved timers' place says what they
 * are for. The time left ticks each second while something runs.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Timer } from '@unlease/clock/models/timer';
import { lengthSentence, quickLengths } from '@unlease/clock/services/timers';
import { useTick } from '@app/hooks/useTick';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { shownRun, startTimer, useToolsStore } from '@app/store/toolsStore';
import { AppText, EdgeScrollView, EmptyLine, FAB_CLEARANCE, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { SHAPES } from '@unlease/design/shapes';

import { LengthFigure } from './LengthFigure';
import { RunCard } from './RunCard';
import { SavedTimerCard } from './SavedTimerCard';

interface Props {
  readonly bottom: number;
  readonly onOpen: (id: string) => void;
}

export function TimersTab({ bottom, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const prefs = useClockUiStore(selectPrefs);
  const stored = useToolsStore(state => state.runs);
  const recent = useToolsStore(state => state.recent);
  const timers = useLibraryStore(state => state.timers);
  const order = useLibraryStore(state => state.timerOrder);
  const counting = stored.some(run => run.state !== 'paused');
  const now = useTick(1000, counting);
  // Ringing first (it asks for an answer), then by when each started.
  const runs = useMemo(() => stored.map(run => shownRun(run, now)).sort((a, b) => Number(b.state === 'ringing') - Number(a.state === 'ringing') || a.startedAt - b.startedAt), [stored, now]);
  const saved = useMemo(() => order.map(id => timers[id]).filter((timer): timer is Timer => timer !== undefined), [order, timers]);
  const quick = useMemo(() => quickLengths(recent), [recent]);
  const runningOf = (id: string): number => stored.filter(run => run.timerId === id).length;
  const start = (timer: Timer): void => {
    startTimer({ seconds: timer.seconds, timer });
  };

  return (
    <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom + FAB_CLEARANCE }]}>
      {runs.length > 0 ? (
        <View style={styles.list}>
          {runs.map(run => (
            <RunCard key={run.id} run={run} now={now} twelveHours={prefs.twelveHours} />
          ))}
        </View>
      ) : null}

      {/* The lengths to start in a tap need no title: they say what they are. */}
      <View style={[styles.chips, runs.length > 0 && styles.chipsAfter]} accessibilityLabel={t('Quick start')}>
        {quick.map(length => (
          <Tappable key={length} onPress={() => startTimer({ seconds: length })} accessibilityRole="button" accessibilityLabel={t('Start a {length} timer', { length: lengthSentence(length) })} style={styles.chip}>
            <LengthFigure seconds={length} size={24} />
          </Tappable>
        ))}
      </View>

      {saved.length > 0 ? (
        <>
        <AppText variant="section" accessibilityRole="header" style={styles.section}>
          {t('Saved timers')}
        </AppText>
        <View style={styles.list}>
          {saved.map(timer => (
            <SavedTimerCard key={timer.id} timer={timer} running={runningOf(timer.id)} onOpen={onOpen} onStart={start} />
          ))}
        </View>
        </>
      ) : (
        <EmptyLine text={t('The + button saves the ones you start again and again: pasta, tea, eggs… each with its label.')} style={styles.empty} />
      )}
    </EdgeScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    content: { paddingTop: 4 },
    list: { paddingHorizontal: 12, gap: 8 },
    section: { marginTop: 24, marginBottom: 8, marginHorizontal: 28 },
    // Three by two: each a length to start at once, as wide as its neighbours.
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 },
    chipsAfter: { marginTop: 16 },
    // A length to start: raised paper, as a card, its figure large.
    chip: { flexGrow: 1, flexBasis: '30%', minHeight: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, ...corners(SHAPES.card) },
    empty: { marginHorizontal: 28, marginTop: 24 },
  });
}
