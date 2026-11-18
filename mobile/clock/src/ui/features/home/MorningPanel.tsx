/**
 * The chosen morning, under the week's strip: its day and how long until it rings, the time at 56 in
 * Signika, the alarm's name, « Ignorer cette fois » (its next ring) or « Ne plus ignorer »; then the
 * day's first event from Agenda, how far it stands from the alarm and « Ajouter une alarme » for it
 * (`bellPlus`: the editor filled with its hour, its title and its days); when it comes too soon (or
 * before the alarm), a row in Safran with « Sonner à 7:00 »; « Voir la journée » at its foot.
 *
 * A swipe across moves to the morning before or after, within the week: the morning follows the
 * finger, fading as it goes; let go past a third of the width or flung (its threshold clicks), it
 * goes on its way out and the next comes in from its side; short of it, or at the week's ends (where
 * it only gives a little), it springs back. A morning chosen slides in on the shared axis, from the
 * side of its day (250, decelerate). Reduce Motion: nothing follows the finger, the morning simply
 * changes. TalkBack: the head (its day) offers « Jour précédent » and « Jour suivant ».
 */
import React, { memo, useCallback, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Extrapolation, interpolate, Keyframe, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { clockWords } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { instantToDay, instantToWall } from '@unlease/calendar/services/time';
import { earlierTime } from '@unlease/clock/services/morning';
import { nextRing } from '@unlease/clock/services/schedule';
import { stillToRing, type Morning } from '@unlease/clock/services/week';
import { alarmClock, alarmName, distanceWords, offDayWords, ringDayWords, untilWords } from '@unlease/clock/services/words';
import { useAppReachable } from '@shared/app/hooks/useAppReachable';
import { dayPlace, openInApp } from '@shared/app/openApp';
import { haptic } from '@shared/platform/haptics';
import { AppText, Button, Icon, IconButton, Organic } from '@shared/ui/components';
import { decelerate, duration, FLING_SPEED, spatial, SWIPE_SHARE, throwTo } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { ringEarlier, skipNext, unskip } from '@app/store/actions';

interface Props {
  readonly morning: Morning;
  readonly now: number;
  /** -1 when the morning chosen lies before the last one, 1 after: the side it comes in from. */
  readonly from: -1 | 0 | 1;
  readonly margin: number;
  readonly twelveHours: boolean;
  /** Whether the week holds a morning before this one, and after it: where a swipe can go. */
  readonly previous: boolean;
  readonly next: boolean;
  /** The morning before (-1) or after (1) chosen; false when there is none. */
  readonly onStep: (direction: 1 | -1) => boolean;
  readonly onOpen: (id: string) => void;
  /** « Ajouter une alarme » for the day's first event: the editor, filled from it. */
  readonly onAlarmFor: (occurrence: Occurrence) => void;
  /** « Régler une alarme » on a morning with none: a new alarm's form, set for that day. */
  readonly onNew: (day: string) => void;
}

/** A swipe starts once the finger has gone this far across, and fails once it goes this far up or down first: the home scrolls. */
const SWIPE_START = 20;
const SWIPE_CROSS = 12;
/** The morning is gone (and the next comes) once it has travelled this share of the width, fading on the way. */
const LEAVE_SHARE = 0.6;
/** At the week's ends it gives under the finger, a third as fast at first, never past this. */
const END_GIVE = 48;

function resisted(drag: number): number {
  'worklet';
  return Math.sign(drag) * END_GIVE * (1 - 1 / (1 + Math.abs(drag) / (END_GIVE * 3)));
}

const slideFrom = (side: -1 | 0 | 1) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateX: side * 16 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate },
  }).duration(duration.medium);

function MorningPanelComponent({ morning, now, from, margin, twelveHours, previous, next, onStep, onOpen, onAlarmFor, onNew }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  /** How far the morning has gone under the finger (or on its way out). */
  const x = useSharedValue(0);
  const origin = useSharedValue(0);
  const armed = useSharedValue(false);

  // The next morning drawn: it comes in from its side, in place; one that never came springs back.
  useLayoutEffect(() => {
    cancelAnimation(x);
    x.value = 0;
  }, [morning.day, x]);
  const turn = useCallback(
    (direction: 1 | -1) => {
      if (!onStep(direction)) x.value = withSpring(0, spatial);
    },
    [onStep, x],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId('morning-swipe')
        .activeOffsetX([-SWIPE_START, SWIPE_START])
        .failOffsetY([-SWIPE_CROSS, SWIPE_CROSS])
        .onStart(() => {
          // Caught on its way back: it goes on from where it is.
          cancelAnimation(x);
          origin.value = reduced ? 0 : x.value;
        })
        .onUpdate(event => {
          // Which way is decided as the finger goes: to the left, the morning after; to the right, the one before.
          const drag = origin.value + event.translationX;
          const open = drag < 0 ? next : previous;
          if (!reduced) x.value = open ? drag : resisted(drag);
          // A click when letting go would change the morning, another when it no longer would.
          const past = open && Math.abs(drag) > (width.value || 1) * SWIPE_SHARE;
          if (past !== armed.value) {
            armed.value = past;
            runOnJS(haptic)(past ? 'threshold' : 'release');
          }
        })
        .onEnd((event, success) => {
          const past = armed.value;
          armed.value = false;
          const drag = origin.value + event.translationX;
          const direction: 1 | -1 = drag < 0 ? 1 : -1;
          const open = direction === 1 ? next : previous;
          const flung = Math.abs(event.velocityX) > FLING_SPEED && Math.sign(event.velocityX) === Math.sign(drag);
          if (!success || !open || (!past && !flung)) {
            // Back into place with the hand's own speed, settling without a bounce.
            x.value = withSpring(0, { ...spatial, velocity: event.velocityX });
            return;
          }
          // Flung short of the threshold, it still says it will change.
          if (!past) runOnJS(haptic)('threshold');
          if (reduced) {
            runOnJS(turn)(direction);
            return;
          }
          // On its way out with the hand's speed (or pushed, M3's exit); the next comes in once it is gone.
          x.value = throwTo(-direction * (width.value || 400) * LEAVE_SHARE, x.value, event.velocityX, finished => {
            if (finished) runOnJS(turn)(direction);
          });
        }),
    [next, previous, reduced, turn, x, origin, armed, width],
  );
  const following = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.value), [0, (width.value || 400) * LEAVE_SHARE], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: x.value }],
  }));
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );
  // TalkBack's way across: on the head, which names the day (only where there is one to go to).
  const stepActions = [...(previous ? [{ name: 'previous', label: t('Previous day') }] : []), ...(next ? [{ name: 'next', label: t('Next day') }] : [])];
  const onStepAction = (event: AccessibilityActionEvent): void => {
    if (event.nativeEvent.actionName === 'previous') onStep(-1);
    else if (event.nativeEvent.actionName === 'next') onStep(1);
  };
  const today = instantToDay(now);
  const waking = morning.waking;
  const toCome = stillToRing(morning, now);
  const skippable = waking && toCome && waking.alarm.days.length > 0 && nextRing(waking.alarm, now)?.day === morning.day;
  const first = morning.first;
  // « Voir la journée » only when Agenda can be opened: installed here, or run by the server.
  const agendaReachable = useAppReachable('calendar');
  const clockOf = (at: number): string => clockWords(instantToWall(at, '').slice(11, 16), twelveHours);
  const fix = morning.clash ? earlierTime(morning.clash, margin) : null;
  const canFix = fix !== null && morning.wakeup !== null && fix.at > now && fix.at < morning.wakeup.at;
  // An alarm for the day's first event while it is still to start (an all-day event has no hour to take).
  const firstTitle = first ? first.event.title.trim() || t('Untitled') : '';
  const alarmable = first !== null && !first.allDay && first.startAt > now;
  const enter = reduced ? undefined : slideFrom(from);

  const head = [ringDayWords(morning.day, today), waking && toCome ? untilWords(waking.at, now).toLocaleLowerCase() : waking ? t('rang at {time}', { time: alarmClock(waking.alarm.time, twelveHours) }) : ''].filter(Boolean).join(' · ');

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={styles.frame}>
        <Organic outline="panel" style={styles.panel} onLayout={onLayout}>
          <Animated.View style={[styles.body, following]}>
            {/* The head stays one view as the days change, so TalkBack keeps its place on it. */}
            <View accessible accessibilityLabel={head} accessibilityActions={stepActions} onAccessibilityAction={onStepAction}>
              <Animated.View key={morning.day} entering={enter}>
                <AppText variant="meta">{head}</AppText>
              </Animated.View>
            </View>
            <Animated.View key={morning.day} entering={enter} style={styles.morning}>
              {waking ? (
                <>
                  <AppText
                    style={[styles.time, !toCome && styles.past]}
                    accessibilityRole="button"
                    accessibilityLabel={t('Alarm at {time}', { time: alarmClock(waking.alarm.time, twelveHours) })}
                    accessibilityHint={t('Opens the alarm')}
                    onPress={() => onOpen(waking.alarm.id)}
                  >
                    {alarmClock(waking.alarm.time, twelveHours)}
                  </AppText>
                  <View style={styles.nameRow}>
                    {/* Its name when it has one: its days are the strip's and the card's to say. */}
                    <AppText variant="bodyStrong" style={styles.grow} numberOfLines={1}>
                      {waking.alarm.label.trim() ? alarmName(waking.alarm) : ''}
                    </AppText>
                    {skippable ? <Button kind="text" small label={t('Skip this time')} onPress={() => skipNext(waking.alarm.id)} /> : null}
                  </View>
                </>
              ) : (
                // A morning with an alarm's anatomy: the time's place blank (as the strip's dash says it), then « Pas
                // d'alarme » and the way to set one, so switching an alarm on moves nothing.
                <>
                  <AppText style={[styles.time, styles.blank]} accessibilityElementsHidden importantForAccessibility="no">
                    --:--
                  </AppText>
                  <View style={styles.nameRow}>
                    <AppText variant="bodyStrong" color={theme.color.inkMuted} style={styles.grow} numberOfLines={1}>
                      {t('No alarm')}
                    </AppText>
                    <Button kind="text" small icon="plus" label={t('Set an alarm')} onPress={() => onNew(morning.day)} />
                  </View>
                </>
              )}
              {morning.skipped.map(alarm => (
                <View key={alarm.id} style={styles.nameRow}>
                  <AppText variant="meta" color={theme.color.waiting} style={styles.grow} numberOfLines={2}>
                    {t('{alarm} at {time} skipped this morning', { alarm: alarmName(alarm), time: alarmClock(alarm.time, twelveHours) })}
                  </AppText>
                  <Button kind="text" small label={t('Ring after all')} onPress={() => unskip(alarm.id)} />
                </View>
              ))}
              {/* A public holiday or a day off (Agenda's) keeps the alarms that ask for it quiet: said, never hidden. */}
              {morning.offDay?.alarms.map(alarm => (
                <View key={`off:${alarm.id}`} style={styles.nameRow}>
                  <AppText variant="meta" color={theme.color.waiting} style={styles.grow} numberOfLines={2}>
                    {offDayWords(alarm, morning.offDay!.reason, twelveHours)}
                  </AppText>
                </View>
              ))}

              <View style={styles.rule} />

              <View style={styles.event}>
                <Icon name="today" size={24} color={theme.color.inkMuted} />
                <View style={styles.grow}>
                  {first ? (
                    <>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {`${clockOf(first.startAt)} · ${firstTitle}`}
                      </AppText>
                      <AppText variant="meta">{waking && toCome ? distanceWords(Math.round((first.startAt - waking.at) / 60_000)) : morning.day === today ? t('Next in your calendar today') : t('The day’s first event')}</AppText>
                    </>
                  ) : morning.allDay.length > 0 ? (
                    <>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {morning.allDay.map(item => item.event.title.trim() || t('Untitled')).join(', ')}
                      </AppText>
                      <AppText variant="meta">{t('All day')}</AppText>
                    </>
                  ) : (
                    <AppText variant="body" color={theme.color.inkMuted}>
                      {/* Today with everything over: the strip's dot says the day held something, so the line says none is left. */}
                      {morning.later ? t('Nothing in your calendar after this alarm.') : morning.day === today && morning.events > 0 ? t('Nothing left in your calendar today.') : t('Nothing in your calendar that day.')}
                    </AppText>
                  )}
                </View>
                {alarmable ? <IconButton icon="bellPlus" label={t('Add an alarm for “{title}”', { title: firstTitle })} onPress={() => onAlarmFor(first)} /> : null}
              </View>

              {morning.clash && morning.wakeup ? (
                <View style={styles.clash} accessibilityLiveRegion="polite">
                  <Icon name="alert" size={20} color={theme.color.waiting} />
                  <AppText variant="meta" color={theme.color.ink} style={styles.grow}>
                    {morning.clash.minutes < 0 ? t('It starts before your alarm.') : t('Less than {span} to get ready.', { span: spanWords(margin) })}
                  </AppText>
                  {canFix ? <Button kind="tonal" label={t('Ring at {time}', { time: clockWords(fix!.time, twelveHours) })} onPress={() => ringEarlier(morning.wakeup!.alarm.id, fix!.day, fix!.time)} /> : null}
                </View>
              ) : null}
              {agendaReachable ? <Button kind="text" small label={t('View the day')} onPress={() => openInApp('calendar', dayPlace(morning.day)).catch(() => undefined)} style={styles.foot} /> : null}
            </Animated.View>
          </Animated.View>
        </Organic>
      </View>
    </GestureDetector>
  );
}

export const MorningPanel = memo(MorningPanelComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    frame: { marginHorizontal: 12 },
    // Clipped: a morning under the finger goes out of its edge, never over the ground.
    panel: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    body: { paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
    morning: { gap: 2 },
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 56, lineHeight: 62, letterSpacing: -1, color: theme.color.ink, fontVariant: ['tabular-nums'], alignSelf: 'flex-start' },
    past: { color: theme.color.inkMuted },
    // No alarm: the time's figure left blank, in the faint ink.
    blank: { color: theme.color.inkFaint },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
    grow: { flex: 1 },
    rule: { height: 1, backgroundColor: theme.color.hairline, marginVertical: 10 },
    event: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 },
    clash: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 6, paddingLeft: 2 },
    // The day's own way into Agenda, at the panel's foot, its end in line with the buttons above.
    foot: { alignSelf: 'flex-end', marginTop: 4, marginBottom: -4 },
  });
}
