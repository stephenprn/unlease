/**
 * A link in its line: image in a fixed 4:5 frame; beside it where it comes from and what it
 * costs, what it is, and two facts (`linkRowText`, shared with the web); the done stamp. A price
 * that moved says by how much beside it (a drop in the ok ink, a rise in the second); the owner's
 * note, quoted, takes the facts' line, so a list shows which links carry one.
 * The row keeps its height when the reading lands, so nothing jumps under a finger.
 * Slid sideways it is stamped (or put back to do), as a contact's row calls: past its threshold it
 * clicks and turns full strength, and only let go there does it act (a throw short of it springs
 * back); under Reduce Motion the row stays put and what the slide would uncover fades in over it.
 * Pressed, it opens the link's page.
 *
 * The row as drawn, handed its link and what stamping and reading again write: Carnet's `LinkRow`
 * connects it to its library, and Pages (which shows collections in its pages) to its own. A leaf:
 * it imports no app's store (`borrowGuard`).
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeOut, Keyframe, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { priceChangeText } from '@unlease/notes/services/priceWatch';
import { peopleNames } from '@unlease/notes/services/noteMentions';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import type { LinkItem } from '@unlease/notes/models/entities';
import { selectCanRead, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { showSnack } from '@shared/app/store/uiStore';
import { haptic } from '@shared/platform/haptics';

import { AnimatedOrganic, AppText, Grain, Icon, IconButton, Organic, Stamp, Tappable, stampWord } from '../../components';
import { decelerate, duration, listPressDelay, spatial, standard, SWIPE_SHARE } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { KIND_ICONS } from './kindIcon';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';

export const LINK_IMAGE = { width: 76, height: 95 } as const;

/** Past the swipe's share of the screen (`SWIPE_SHARE`) the slide stamps once let go; beyond it the row follows the hand at a third of its speed. */
const RESIST = 0.35;
/** « Réessayer » sits on an 18 high line: 48 under a finger. */
const RETRY_SLOP = { top: 15, bottom: 15, left: 4, right: 8 } as const;

/** A rubber stamp pressed down: it comes in a little large and settles flat on the frame, no bounce. */
const STAMP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 1.3 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const STAMP_OUT = FadeOut.duration(duration.short);

export interface LinkRowViewProps {
  readonly id: string;
  /** The link as the library holds it now; nothing is drawn without it. */
  readonly link: LinkItem | undefined;
  readonly onOpen: (id: string) => void;
  readonly onLongPress?: (id: string) => void;
  /** Stamps the link (or puts it back to do); hands back the way to take it back. */
  readonly onSetDone: (id: string, done: boolean) => () => void;
  /** « Relire la page », or « Lire la page » on a link kept unread: the link read (again). */
  readonly onRetry: (id: string) => void;
  /** The finger down on the row and lifted: its list's rules step aside while it is pressed. */
  readonly onPressIn?: () => void;
  readonly onPressOut?: () => void;
}

function LinkRowViewComponent({ id, link, onOpen, onLongPress, onSetDone, onRetry, onPressIn, onPressOut }: LinkRowViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width: screen } = useWindowDimensions();
  const reduced = useReducedMotion();
  // The row and what its slide uncovers share one outline for life; its picture's frame has its own.
  const outline = 'row';
  const reading = useSettingsStore(selectCanRead);
  // « Réessayer », « Lire la page »: once the server said Claude has a key.
  const claude = useServerFeature('claude');
  const source = useBlobSource(link?.imageIds[0]);
  const done = !!link?.done;
  const pending = !!link && link.status === 'pending' && reading;
  const threshold = screen * SWIPE_SHARE;

  const x = useSharedValue(0);
  const over = useSharedValue(false);
  const armed = useSharedValue(0);
  const fade = useSharedValue(done ? 0.55 : 1);
  // Off its place, the row is a strip of the wall pulled aside: opaque and grained, so what it uncovers reads.
  const [lifted, setLifted] = useState(false);
  const [past, setPast] = useState(false);
  // What the hole says is fixed when the hand takes the row: the stamp landing must not rewrite it on the way back.
  const [held, setHeld] = useState<boolean | null>(null);
  // The pictures that would not load: the kept copy (offline, not cached yet) gives way to the page's
  // own, and that one (a site refusing apps) to the kind's glyph, never an empty frame.
  const [unloaded, setUnloaded] = useState<readonly string[]>([]);
  // The stamp lands only when it is pressed here, never when a row scrolls into view already done.
  const [pressedHere, setPressedHere] = useState(false);

  useEffect(() => {
    fade.value = withTiming(done ? 0.55 : 1, { duration: duration.medium, easing: standard });
  }, [done, fade]);

  const toggle = useCallback(() => {
    const current = link;
    if (!current) return;
    setPressedHere(true);
    const undo = onSetDone(id, !current.done);
    showSnack(current.done ? t('Back to do') : t('Stamped “{stamp}”', { stamp: stampWord(current.kind) }), { label: t('Undo'), run: undo }, { tone: 'success' });
  }, [id, link, onSetDone]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!pending)
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onStart(() => {
          runOnJS(setHeld)(done);
          if (!reduced) runOnJS(setLifted)(true);
        })
        .onUpdate(event => {
          const reach = Math.abs(event.translationX);
          x.value = Math.sign(event.translationX) * (reach <= threshold ? reach : threshold + (reach - threshold) * RESIST);
          if (reach > threshold !== over.value) {
            over.value = reach > threshold;
            armed.value = reduced ? (over.value ? 1 : 0) : withTiming(over.value ? 1 : 0, { duration: duration.short, easing: standard });
            runOnJS(setPast)(over.value);
            runOnJS(haptic)(over.value ? 'threshold' : 'release');
          }
        })
        .onEnd(event => {
          // Only let go past the threshold: a throw short of it stamps nothing.
          const past = over.value;
          if (past) runOnJS(toggle)();
          over.value = false;
          armed.value = reduced ? 0 : withTiming(0, { duration: duration.short, easing: standard });
          runOnJS(setPast)(false);
          // The row goes back to its place with the hand's speed, whatever was decided; under Reduce Motion what showed over it fades.
          const back = (finished?: boolean) => {
            'worklet';
            if (finished) {
              runOnJS(setLifted)(false);
              runOnJS(setHeld)(null);
            }
          };
          x.value = reduced ? withTiming(0, { duration: duration.short, easing: standard }, back) : withSpring(0, { ...spatial, velocity: event.velocityX * (past ? RESIST : 1) }, back);
        }),
    [pending, done, reduced, threshold, toggle, x, over, armed],
  );

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : x.value }] }));
  // Uncovered, it shows at once; laid over the row (Reduce Motion), it fades in as the hand nears the threshold.
  const hole = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, reduced ? threshold : 12], [0, 1], Extrapolation.CLAMP) }));
  const start = useAnimatedStyle(() => ({ opacity: x.value > 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));
  const end = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));
  const frame = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!link) return null;

  // Pending with nobody to read it is a plain link, not a reading that never ends.
  const failed = link.status === 'failed';
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const text = linkRowText(link);
  const people = peopleNames(link.contactIds);
  const { price, priceChange, note } = text;
  // A drop in the ok ink, a rise (or a done link's change) quieter, in the second ink.
  const changeInk = priceChange?.direction === 'down' && !done ? theme.color.ok : theme.color.inkMuted;
  const kept = source && !unloaded.includes(source.uri) ? source : null;
  const image = kept ?? (link.imageUrl && !unloaded.includes(link.imageUrl) ? { uri: link.imageUrl } : null);
  // What the row shows of its state, heard after its name: read now, not read, done on a day.
  const state = pending
    ? t('Reading the page…')
    : failed
      ? link.error
        ? t(link.error)
        : t('Couldn’t read it')
      : done && link.doneAt
        ? t('{stamp} on {date}', { stamp: stampWord(link.kind), date: formatDay(link.doneAt, Date.now()) })
        : null;
  const undoing = held ?? done;
  const verb = undoing ? t('To-do') : stampWord(link.kind);
  // Stamping turns "done" on: matcha. Putting it back to do turns it off: the plain well.
  const holeInk = undoing ? theme.color.ink : theme.color.onActionContainer;
  const glyph = undoing ? 'undo' : 'stamp';

  const uncovered = (
    <AnimatedOrganic pointerEvents="none" outline={outline} style={[StyleSheet.absoluteFill, styles.hole, undoing ? styles.holeUndo : styles.holeStamp, hole]}>
      <Animated.View style={[styles.holeStart, start]}>
        <Icon name={glyph} size={24} color={holeInk} solid={past && undoing} />
        <AppText variant="label" color={holeInk}>
          {verb}
        </AppText>
      </Animated.View>
      <Animated.View style={[styles.holeEnd, end]}>
        <AppText variant="label" color={holeInk}>
          {verb}
        </AppText>
        <Icon name={glyph} size={24} color={holeInk} solid={past && undoing} />
      </Animated.View>
    </AnimatedOrganic>
  );

  return (
    <View style={styles.slot}>
      {reduced ? null : uncovered}
      <GestureDetector gesture={pan}>
        <Animated.View style={strip}>
          {lifted ? (
            <Organic pointerEvents="none" outline={outline} style={[StyleSheet.absoluteFill, styles.lifted]}>
              <Grain />
            </Organic>
          ) : null}
          <Tappable
            unstable_pressDelay={listPressDelay}
            onPress={() => onOpen(id)}
            onLongPress={() => onLongPress?.(id)}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityLabel={[text.title, text.source, pending ? null : price, pending || !priceChange ? null : priceChangeText(link, Date.now())?.text, state, note ? t('Your note: {note}', { note }) : null].filter(Boolean).join(', ')}
            accessibilityActions={pending ? undefined : [{ name: 'stamp', label: done ? t('Put back to do') : t('Mark as {stamp}', { stamp: stampWord(link.kind).toLowerCase() }) }]}
            onAccessibilityAction={toggle}
            outline={outline}
            style={styles.row}
          >
            <AnimatedOrganic outline="frame" style={[styles.image, image ? styles.picture : null, frame]}>
              {image ? (
                <Image source={image} style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]} resizeMode="cover" onError={() => setUnloaded(lost => [...lost, image.uri])} />
              ) : !done && !pending ? (
                <Icon name={KIND_ICONS[link.kind]} size={30} color={theme.color.inkMuted} />
              ) : null}
            </AnimatedOrganic>
            {done && link.doneAt ? (
              // Centred on the frame; a done link without a picture shows the stamp alone in it.
              <Animated.View entering={pressedHere ? STAMP_IN : undefined} exiting={STAMP_OUT} style={styles.stamp} pointerEvents="none">
                <Stamp kind={link.kind} date={formatDay(link.doneAt, Date.now())} />
              </Animated.View>
            ) : null}
            <View style={styles.text}>
              <View style={styles.head}>
                <View style={styles.overline}>
                  <AppText variant="metaStrong" numberOfLines={1} style={styles.flex}>
                    {text.source}
                  </AppText>
                  {price && priceChange && !pending ? (
                    // Heard with the price, in the row's name.
                    <View style={styles.change} importantForAccessibility="no-hide-descendants">
                      <Icon name={priceChange.direction === 'down' ? 'arrowDown' : 'arrowUp'} size={14} color={changeInk} />
                      <AppText variant={changeInk === theme.color.ok ? 'metaStrong' : 'meta'} color={changeInk}>
                        {priceChange.amount}
                      </AppText>
                    </View>
                  ) : null}
                  {price && !pending ? (
                    <AppText variant="price" color={done ? theme.color.inkMuted : undefined}>
                      {price}
                    </AppText>
                  ) : null}
                </View>
                {/* A title made from the address, before any reading, says so in the second ink. */}
                <AppText variant="bodyStrong" numberOfLines={2} color={done || !link.title ? theme.color.inkMuted : undefined}>
                  {text.title}
                </AppText>
              </View>
              {pending ? (
                <View style={styles.reading}>
                  <ReadingTrack width={72} />
                  <AppText variant="meta">{t('Reading the page…')}</AppText>
                </View>
              ) : failed ? (
                <View style={styles.failed}>
                  <Icon name="alert" size={14} color={theme.color.danger} />
                  <AppText variant="meta" numberOfLines={1} style={styles.shrink}>
                    {link.error ? t(link.error) : t('Couldn’t read it')}
                  </AppText>
                  {claude ? (
                    <Tappable onPress={() => onRetry(id)} accessibilityLabel={t('Read the page again')} hitSlop={RETRY_SLOP} style={styles.retry}>
                      <AppText variant="metaStrong" color={theme.color.link}>
                        {t('Try again')}
                      </AppText>
                    </Tappable>
                  ) : null}
                </View>
              ) : unread && claude ? (
                // Kept without being read, while the server can read it: one tap reads it (the web's).
                <View style={styles.failed}>
                  <Tappable onPress={() => onRetry(id)} accessibilityLabel={t('Read {title}', { title: text.title })} hitSlop={RETRY_SLOP} style={[styles.retry, styles.retryAlone]}>
                    <AppText variant="metaStrong" color={theme.color.link}>
                      {t('Read the page')}
                    </AppText>
                  </Tappable>
                </View>
              ) : people.length > 0 || text.facts.length > 0 || note ? (
                // Whom it is for first (a gift idea's), then its facts.
                <View style={styles.foot}>
                  {people.length > 0 ? <Icon name="person" size={14} color={theme.color.inkMuted} /> : null}
                  <AppText variant="meta" numberOfLines={1} style={styles.shrink}>
                    {/* The owner's note, quoted, takes the facts' line: the row keeps its frame's height. */}
                    {[people.join(', '), ...(note ? [note] : text.facts)].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              ) : null}
            </View>
            {/* The page itself, one tap away from the list; the rest of the row opens what was kept of it. */}
            <IconButton icon="external" label={t('Open the link')} shape={1} onPress={() => Linking.openURL(link.url).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }))} />
          </Tappable>
        </Animated.View>
      </GestureDetector>
      {reduced ? uncovered : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Inset by 6 so its press, an organic pebble, stays inside the page's margin.
    slot: { marginHorizontal: 6 },
    // As much in at the end as at the start: the open button's 48 ends 16 from the list's edge, as the frame starts,
    // its glyph in line with the add strip's button above the rows.
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, paddingVertical: 10, minHeight: LINK_IMAGE.height + 20 },
    lifted: { backgroundColor: theme.color.wall, overflow: 'hidden' },
    // What the slid row uncovers: a well cut in the wall, saying what letting go will do.
    hole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
    holeStamp: { backgroundColor: theme.color.actionContainer },
    holeUndo: { backgroundColor: theme.color.paperHigh },
    holeStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    holeEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    image: {
      width: LINK_IMAGE.width,
      height: LINK_IMAGE.height,
      overflow: 'hidden',
      backgroundColor: theme.color.paperHigh,
      borderWidth: 1,
      borderColor: theme.color.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A picture lies on cream paper: by day a product shot's white becomes the paper (multiply), at night it glares less.
    picture: { backgroundColor: theme.color.paper, isolation: 'isolate' },
    photoDay: { mixBlendMode: 'multiply' },
    photoNight: { opacity: 0.86 },
    stamp: { position: 'absolute', left: 10, top: 0, bottom: 0, width: LINK_IMAGE.width, alignItems: 'center', justifyContent: 'center' },
    // As tall as the frame (taller only with a large system font): where it comes from and what it is from its top, the facts on its foot.
    text: { flex: 1, minHeight: LINK_IMAGE.height, justifyContent: 'space-between' },
    head: { gap: 2 },
    overline: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 20 },
    // Just before the price: the overline's 12, less 4.
    change: { flexDirection: 'row', alignItems: 'center', gap: 1, marginRight: -4 },
    reading: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 18 },
    failed: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 18 },
    foot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    retry: { justifyContent: 'center', paddingHorizontal: 4 },
    // Alone on its line, its label lines up with the text above.
    retryAlone: { marginLeft: -4 },
    flex: { flex: 1 },
    shrink: { flexShrink: 1 },
  });

export const LinkRowView = memo(LinkRowViewComponent);
