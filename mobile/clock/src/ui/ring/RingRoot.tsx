/**
 * The ringing window (`ringWindow` in index.js; `alarm/RingActivity` shows it over the lock screen,
 * turning the screen on). What it serves: someone woken in a dark room, eyes half open, the phone at
 * arm's length. So it is always the night theme on the night ground (a white screen at dawn blinds),
 * the time large enough to read without glasses, then the morning in a few lines set straight on the
 * night, no card (the weather where the phone is, the day's next events from Agenda, « Voir la
 * journée »), each only when the alarm asks for it, so the sun coming up under them stays in sight;
 * and in the thumb's reach, « Répéter », one large tap on a pane of tinted glass the sunrise shows
 * through, and « Arrêter », a pebble slid along its
 * track, so a pocket or a sleepy hand never stops an alarm by accident (TalkBack: the track is a
 * button). The sound, the vibration and the notification's own buttons are the engine's: this window
 * only draws and answers, and closes once the alarm is snoozed or stopped, wherever that was done.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolate, Keyframe, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { clockWords, dayTitle, longDay } from '@unlease/calendar/services/eventText';
import { instantToDay, instantToWall } from '@unlease/calendar/services/time';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { dayAhead } from '@unlease/clock/services/morning';
import { dayWords, nowWords, WEATHER_GLYPHS, weatherAt, weatherKind } from '@unlease/clock/services/weather';
import { minutesWords } from '@unlease/clock/services/words';
import { dayPlace, openInApp } from '@shared/app/openApp';
import { haptic } from '@shared/platform/haptics';
import { AnimatedOrganic, AppText, Button, EdgeScrollView, Ground, Icon, Organic, Tappable } from '@shared/ui/components';
import { withAlpha } from '@unlease/design/color';
import { decelerate, duration, FLING_SPEED, spatial } from '@shared/ui/theme/motion';
import { ThemeProvider, useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { corners } from '@shared/ui/theme/shape';
import { NO_RING, onRing, ringing, snooze, stop, unlock, type RingState } from '@platform/alarmEngine';
import type { ClockWeatherResponse } from '@unlease/clock/sync/routes';
import { concentric, RADII, SHAPES } from '@unlease/design/shapes';

import { bootstrap } from '@app/bootstrap';
import { useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { keptWeather, refreshWeather } from '@app/weather';

import { Tide } from './Tide';
import { RingBeacon } from './RingBeacon';

/** The window's one entrance: what rings settles in from a little below (600 decelerate), the morning's panel after it. */
const ARRIVE = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 18 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(600);
const ARRIVE_LATER = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 18 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } })
  .duration(600)
  .delay(180);

/** The test ring's id (Réglages' « Essayer »): it shows the weather and the day as an alarm would. */
const TEST_ID = '__test__';
/** As it rings, the forecast is asked again for this long at most: what was kept shows meanwhile. */
const RING_WEATHER_MS = 4000;
/** The day's events shown before « + n autres ». */
const SHOWN_EVENTS = 3;
/** The events' time column, at the font's own scale. */
const WHEN_WIDTH = 76;
/** How far the pebble must go to stop the alarm. */
const STOP_SHARE = 0.72;
const TRACK_HEIGHT = 72;
/** The thumb sits this far inside the track, its corners concentric with the track's. */
const INSET = 6;
const THUMB = { width: 76, height: TRACK_HEIGHT - INSET * 2 - 2 };
const THUMB_RADIUS = concentric(RADII.bar, INSET);
const THUMB_SHAPE: typeof SHAPES.track = [THUMB_RADIUS, THUMB_RADIUS, THUMB_RADIUS, THUMB_RADIUS];

/** The time, again at each minute. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      setNow(Date.now());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 30);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 30);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** What rings, as the engine says it, followed. */
function useRing(): RingState {
  const [ring, setRing] = useState<RingState>(NO_RING);
  useEffect(() => {
    let live = true;
    ringing().then(state => live && setRing(state), () => undefined);
    const subscription = onRing(state => setRing(state));
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return ring;
}

export default function RingRoot(): React.ReactElement {
  // Booted for the alarm's name, the weather and the day; should it fail, the window still shows the
  // time, « Répéter » and « Arrêter », which only need the engine.
  useState(bootstrap);
  return (
    <ThemeProvider mode="dark">
      <GestureHandlerRootView style={rootStyles.root}>
        <SafeAreaProvider>
          <RingWindow />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

const rootStyles = StyleSheet.create({ root: { flex: 1 } });

function RingWindow(): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const now = useNow();
  const ring = useRing();
  const prefs = useClockUiStore(state => state.prefs);
  const alarm = useLibraryStore(state => (ring.id ? state.alarms[ring.id] : undefined));
  const events = useLibraryStore(state => state.events);
  const feeds = useLibraryStore(state => state.feeds);
  const [weather, setWeather] = useState<ClockWeatherResponse | null>(keptWeather);

  const test = ring.id === TEST_ID;
  const showWeather = test || (alarm?.weather ?? false);
  const showAgenda = test || (alarm?.agenda ?? false);
  const today = instantToDay(now);

  // Back leaves nothing: the alarm is answered here or from its notification.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!showWeather) return;
    let live = true;
    refreshWeather({ force: true, timeoutMs: RING_WEATHER_MS }).then(answer => live && answer && setWeather(answer), () => undefined);
    return () => {
      live = false;
    };
  }, [showWeather]);

  const morning = useMemo(() => (showWeather ? weatherAt(weather, now, today) : null), [showWeather, weather, now, today]);
  const ahead = useMemo(() => (showAgenda ? dayAhead({ events: Object.values(events), feeds: Object.values(feeds) }, today) : null), [showAgenda, events, feeds, today]);

  const wall = instantToWall(now, '');
  const time = clockWords(wall.slice(11, 16), prefs.twelveHours);
  const label = ring.label.trim() || (test ? t('Test alarm') : '');
  const snoozed = ring.state === 'snoozed';
  const stopped = ring.state === 'none' && ring.id === '';

  // Unlocked first (the window closes once the alarm stops): cancelled, the alarm rings on and nothing opens.
  const viewDay = useCallback(async () => {
    if (!(await unlock())) return;
    stop();
    await openInApp('calendar', dayPlace(today));
  }, [today]);

  return (
    <View style={styles.screen}>
      <Ground />
      <Tide kind="dawn" active={!snoozed && !stopped} />
      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        {/* The head about a third down, the panel under it, the room shared above and below: nothing stranded. */}
        <View style={styles.above} />
        <Animated.View entering={still ? undefined : ARRIVE} style={styles.head} accessible accessibilityRole="header" accessibilityLabel={[time, label, longDay(today)].filter(Boolean).join(', ')}>
          <RingBeacon glyph="alarm" motion="shake" active={!snoozed && !stopped} />
          <AppText style={styles.time} adjustsFontSizeToFit numberOfLines={1}>
            {time}
          </AppText>
          {label ? (
            <AppText variant="title" style={styles.label} numberOfLines={2}>
              {label}
            </AppText>
          ) : null}
          <AppText variant="bodyStrong" color={theme.color.inkMuted} style={styles.date}>
            {dayTitle(today)}
          </AppText>
          {ring.snoozes > 0 && !snoozed ? (
            <AppText variant="meta" style={styles.center}>
              {ring.snoozes === 1 ? t('Snoozed once') : t('Snoozed {count} times', { count: ring.snoozes })}
            </AppText>
          ) : null}
        </Animated.View>

        {(morning || ahead) && !snoozed ? (
          <Animated.View entering={still ? undefined : ARRIVE_LATER} style={styles.briefHost}>
            {/* No card: a few lines on the night, so the sunrise under them stays in sight. A small screen at a large font scale: they give way to the time and the actions, and scroll, their cut end fading. */}
            <EdgeScrollView capped style={styles.briefScroll} contentContainerStyle={styles.brief}>
              {morning ? <WeatherRow morning={morning} /> : null}
              {morning && ahead ? <View style={styles.rule} /> : null}
              {ahead ? <DayList ahead={ahead} now={now} twelveHours={prefs.twelveHours} onViewDay={viewDay} /> : null}
            </EdgeScrollView>
          </Animated.View>
        ) : null}

        <View style={styles.below} />
        <View style={styles.actions}>
          {snoozed ? (
            <View style={styles.done} accessibilityLiveRegion="polite">
              <Icon name="check" size={20} color={theme.color.slipAction} />
              <AppText variant="bodyStrong">{t('Snoozed until {time}', { time: clockWords(instantToWall(ring.until, '').slice(11, 16), prefs.twelveHours) })}</AppText>
            </View>
          ) : stopped ? null : (
            <>
              <GlassButton icon="moon" label={t('Snooze · {minutes}', { minutes: minutesWords(prefs.snoozeMinutes) })} onPress={snooze} />
              <SlideToStop />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/** The weather where the phone is: now (its glyph, the temperature, the sky) and the day. */
function WeatherRow({ morning }: { readonly morning: NonNullable<ReturnType<typeof weatherAt>> }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const kind = morning.now ? weatherKind(morning.now.code) : morning.kind;
  return (
    <View style={styles.weather} accessible accessibilityLabel={[nowWords(morning), morning.day ? dayWords(morning.day) : ''].filter(Boolean).join(', ')}>
      <Icon name={WEATHER_GLYPHS[kind]} size={24} color={theme.color.waiting} />
      <View style={styles.grow}>
        <AppText variant="bodyStrong" style={styles.lifted}>
          {nowWords(morning)}
        </AppText>
        {morning.day ? (
          <AppText variant="meta" color={theme.color.inkMuted} style={styles.lifted}>
            {dayWords(morning.day)}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** The day ahead: what is on all day, then the timed events from now on, then « Voir la journée ». */
function DayList({ ahead, now, twelveHours, onViewDay }: { readonly ahead: NonNullable<ReturnType<typeof dayAhead>>; readonly now: number; readonly twelveHours: boolean; readonly onViewDay: () => void }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // The time column grows with the font, so « 10:30 AM » stays whole at a large scale.
  const { fontScale } = useWindowDimensions();
  const whenWidth = WHEN_WIDTH * Math.max(1, fontScale);
  const coming = ahead.timed.filter(item => item.endAt > now);
  const rows: { readonly key: string; readonly when: string; readonly title: string; readonly now: boolean; readonly allDay: boolean }[] = [
    ...ahead.allDay.map(item => ({ key: item.key, when: t('All day'), title: titleOf(item), now: false, allDay: true })),
    ...coming.map(item => ({ key: item.key, when: clockWords(instantToWall(item.startAt, '').slice(11, 16), twelveHours), title: titleOf(item), now: item.startAt <= now, allDay: false })),
  ];
  const shown = rows.slice(0, SHOWN_EVENTS);
  const more = rows.length - shown.length;
  return (
    <View style={styles.day}>
      {shown.length === 0 ? (
        <AppText variant="body" color={theme.color.inkMuted} style={styles.lifted}>
          {t('Nothing in your calendar today.')}
        </AppText>
      ) : (
        shown.map(row => (
          <View key={row.key} style={styles.event}>
            {/* « Toute la journée » takes two lines in the column rather than being cut. */}
            <AppText variant={row.now ? 'bodyStrong' : 'body'} color={row.now ? theme.color.waiting : theme.color.inkMuted} style={[styles.when, styles.lifted, { width: whenWidth }]} numberOfLines={row.allDay ? 2 : 1}>
              {row.when}
            </AppText>
            <AppText variant={row.now ? 'bodyStrong' : 'body'} style={[styles.grow, styles.lifted]} numberOfLines={1}>
              {row.title}
            </AppText>
          </View>
        ))
      )}
      <View style={styles.dayFoot}>
        <AppText variant="meta" color={theme.color.inkMuted} style={styles.lifted}>
          {more === 1 ? t('+ 1 more') : more > 1 ? t('+ {count} more', { count: more }) : ''}
        </AppText>
        <Button kind="text" label={t('View the day')} onPress={onViewDay} small />
      </View>
    </View>
  );
}

const titleOf = (item: Occurrence): string => item.event.title.trim() || t('Untitled');

/**
 * « Répéter » over the sunrise: a pane of tinted glass (a veil of the night, a hairline of light round
 * it) the sun shows through, its words and moon in the ink. One large tap, the whole width; pressed,
 * it tints inside its own corners as every control does.
 */
function GlassButton({ icon, label, onPress }: { readonly icon: 'moon'; readonly label: string; readonly onPress: () => void }): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.glass}>
      <Icon name={icon} size={20} color={theme.color.ink} />
      <AppText variant="labelStrong" color={theme.color.ink} style={styles.lifted}>
        {label}
      </AppText>
    </Tappable>
  );
}

/**
 * « Arrêter »: a matcha sheet slid along its track to the end. The track is the « Répéter » pane's
 * tinted glass at the track's radius; the thumb sits 6 inside it, its corners concentric with the
 * track's, and leaves a matcha trail filling the track behind it as it goes. It follows the finger
 * 1:1; past the threshold it clicks, and let go there (or flung) it settles at the end and the alarm
 * stops; short of it, it springs back. Untouched, it leans toward the end every few seconds: the way
 * to go. Reduce Motion: no travel, a release past it stops.
 */
function SlideToStop(): React.ReactElement {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  // The screen's 24 each side, the track's edges and the thumb's inset.
  const travel = Math.max(1, width - 48 - 2 - INSET * 2 - THUMB.width);
  const x = useSharedValue(0);
  const passed = useSharedValue(false);
  const [held, setHeld] = useState(false);

  const done = useCallback(() => {
    haptic('confirm');
    stop();
  }, []);
  const click = useCallback(() => haptic('threshold'), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .onBegin(() => {
          cancelAnimation(x);
          runOnJS(setHeld)(true);
        })
        .onUpdate(event => {
          x.value = Math.min(travel, Math.max(0, event.translationX));
          const past = x.value >= travel * STOP_SHARE;
          if (past !== passed.value) {
            passed.value = past;
            if (past) runOnJS(click)();
          }
        })
        .onEnd(event => {
          if (x.value >= travel * STOP_SHARE || event.velocityX > FLING_SPEED) {
            x.value = reduced ? travel : withTiming(travel, { duration: duration.short, easing: decelerate });
            runOnJS(done)();
          } else {
            x.value = reduced ? 0 : withSpring(0, spatial);
          }
        })
        .onFinalize(() => {
          passed.value = false;
          runOnJS(setHeld)(false);
        }),
    [click, done, passed, reduced, travel, x],
  );

  // Untouched, every few seconds the thumb leans a little toward the end and comes back: the way to go. Reduce Motion: still.
  useEffect(() => {
    if (held || reduced) return undefined;
    x.value = withRepeat(withSequence(withDelay(2200, withTiming(18, { duration: 320, easing: decelerate })), withSpring(0, spatial)), -1, false);
    return () => cancelAnimation(x);
  }, [held, reduced, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // The trail behind it, from the track's start to the thumb's end, stronger as it nears the end.
  const trailStyle = useAnimatedStyle(() => ({ width: THUMB.width + x.value, opacity: 0.55 + 0.45 * Math.min(1, x.value / travel) }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, travel * 0.5], [1, 0], 'clamp') }));

  return (
    <Organic
      shape={SHAPES.track}
      style={styles.track}
      accessible
      accessibilityRole="button"
      accessibilityLabel={t('Stop the alarm')}
      accessibilityHint={t('Slide the button to the end')}
      accessibilityActions={[{ name: 'activate', label: t('Stop') }]}
      onAccessibilityAction={done}
    >
      <AnimatedOrganic shape={THUMB_SHAPE} pointerEvents="none" style={[styles.trail, trailStyle]} />
      <Animated.View style={[styles.trackWords, wordsStyle]} pointerEvents="none">
        <AppText variant="label" color={theme.color.ink}>
          {t('Slide to stop')}
        </AppText>
        <Icon name="chevronRight" size={18} color={theme.color.ink} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.thumb, thumbStyle]} hitSlop={12}>
          <Organic shape={THUMB_SHAPE} style={[styles.thumbSheet, held && styles.thumbHeld]}>
            <Icon name="bellOff" size={26} color={theme.color.onLeaf} />
          </Organic>
        </Animated.View>
      </GestureDetector>
    </Organic>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { flex: 1, paddingHorizontal: 24 },
    head: { alignItems: 'center', gap: 4 },
    date: { textAlign: 'center', marginTop: 2 },
    // The time is the one thing to read half asleep: as large as the width allows, in tabular figures.
    time: { marginTop: 24, fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 96, lineHeight: 108, letterSpacing: -2, color: theme.color.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
    label: { textAlign: 'center' },
    center: { textAlign: 'center' },
    above: { flexGrow: 2, maxHeight: '9%' },
    below: { flexGrow: 3, minHeight: 24 },
    // The morning's lines: a column as wide as a hand, centred under the time, set on the night.
    briefHost: { marginTop: 22, flexShrink: 1, alignSelf: 'center', width: '100%', maxWidth: 360 },
    briefScroll: { flexGrow: 0, flexShrink: 1 },
    brief: { paddingHorizontal: 8 },
    // Lifted off the sun's glow behind: a soft shadow of the night under the words.
    lifted: { textShadowColor: withAlpha(theme.color.wall, 0.85), textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 } },
    weather: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    grow: { flex: 1 },
    rule: { height: 1, backgroundColor: theme.color.hairline, marginVertical: 10 },
    day: { gap: 4 },
    event: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 26 },
    when: { fontVariant: ['tabular-nums'] },
    dayFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    actions: { gap: 14 },
    // One large tap, the whole width in the thumb's reach: tinted glass the sunrise shows through.
    glass: {
      minHeight: 64,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: withAlpha(theme.color.wall, 0.34),
      borderWidth: 1,
      borderColor: withAlpha(theme.color.ink, 0.3),
      ...corners(SHAPES.button),
    },
    done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 64 + 14 + TRACK_HEIGHT },
    // The « Répéter » pane's glass at the track's radius: the sea shows through.
    track: { height: TRACK_HEIGHT, backgroundColor: withAlpha(theme.color.wall, 0.34), borderWidth: 1, borderColor: withAlpha(theme.color.ink, 0.3), justifyContent: 'center', paddingHorizontal: INSET },
    trackWords: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingLeft: THUMB.width },
    trail: { position: 'absolute', left: INSET, top: INSET, height: THUMB.height, backgroundColor: withAlpha(theme.color.leaf, 0.3) },
    thumb: { width: THUMB.width, height: THUMB.height },
    thumbSheet: { width: THUMB.width, height: THUMB.height, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.leaf },
    // Held: a touch lighter, inside its own corners.
    thumbHeld: { opacity: 0.88 },
  });
}
