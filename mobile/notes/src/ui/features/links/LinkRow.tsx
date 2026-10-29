/**
 * A link in its line: image in a fixed 4:5 frame; beside it where it comes from and what it
 * costs, what it is, and two facts (`linkRowText`, shared with the web); the done stamp.
 * The row keeps its height when the reading lands, so nothing jumps under a finger.
 * Slid sideways it is stamped (or put back to do); pressed, it opens the link's page.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeOut, Keyframe, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import { formatDay, formatPrice } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { useBlobSource } from '@app/hooks/useImageSource';
import { reanalyzeLink, setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, useSettingsStore } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { haptic } from '@platform/haptics';

import { AnimatedOrganic, AppText, Grain, Icon, IconButton, Organic, Stamp, Tappable, stampWord } from '../../components';
import { decelerate, duration, listPressDelay, spatial, standard } from '../../theme/motion';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { KIND_ICONS } from './kindIcon';
import { ReadingTrack } from './ReadingTrack';

export const LINK_IMAGE = { width: 76, height: 95 } as const;

/** Past this share of the screen, or thrown, the slide stamps; beyond it the row follows the hand at a third of its speed. */
const THRESHOLD = 0.28;
const RESIST = 0.35;
const FLING = 1200;
/** « Réessayer » sits on an 18 high line: 48 under a finger. */
const RETRY_SLOP = { top: 15, bottom: 15, left: 4, right: 8 } as const;

/** A rubber stamp pressed down: it comes in a little large and settles flat on the frame, no bounce. */
const STAMP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 1.3 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const STAMP_OUT = FadeOut.duration(duration.short);

function LinkRowComponent({ id, onOpen, onLongPress }: { id: string; onOpen: (id: string) => void; onLongPress?: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { width: screen } = useWindowDimensions();
  const link = useLibraryStore(s => s.links[id]);
  // The row and what its slide uncovers share one outline for life; its picture's frame has its own.
  const outline = 'row';
  const reading = useSettingsStore(selectCanRead);
  const source = useBlobSource(link?.imageIds[0]);
  const done = !!link?.done;
  const pending = !!link && link.status === 'pending' && reading;
  const threshold = screen * THRESHOLD;

  const x = useSharedValue(0);
  const over = useSharedValue(false);
  const armed = useSharedValue(0);
  const fade = useSharedValue(done ? 0.55 : 1);
  // Off its place, the row is a strip of the wall pulled aside: opaque and grained, so what it uncovers reads.
  const [lifted, setLifted] = useState(false);
  const [past, setPast] = useState(false);
  // What the hole says is fixed when the hand takes the row: the stamp landing must not rewrite it on the way back.
  const [held, setHeld] = useState<boolean | null>(null);
  // The kept copy that would not load (offline, not cached yet): the page's own picture stands in.
  const [unloaded, setUnloaded] = useState<string | null>(null);
  // The stamp lands only when it is pressed here, never when a row scrolls into view already done.
  const [pressedHere, setPressedHere] = useState(false);

  useEffect(() => {
    fade.value = withTiming(done ? 0.55 : 1, { duration: duration.medium, easing: standard });
  }, [done, fade]);

  const toggle = useCallback(() => {
    const current = useLibraryStore.getState().links[id];
    if (!current) return;
    setPressedHere(true);
    const undo = setLinkDone(id, !current.done);
    showSnack(current.done ? t('Remis à faire') : t('Tamponné « {stamp} »', { stamp: stampWord(current.kind) }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  }, [id]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!pending)
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onStart(() => {
          runOnJS(setHeld)(done);
          runOnJS(setLifted)(true);
        })
        .onUpdate(event => {
          const reach = Math.abs(event.translationX);
          x.value = Math.sign(event.translationX) * (reach <= threshold ? reach : threshold + (reach - threshold) * RESIST);
          if (reach > threshold !== over.value) {
            over.value = reach > threshold;
            armed.value = withTiming(over.value ? 1 : 0, { duration: duration.short, easing: standard });
            runOnJS(setPast)(over.value);
            runOnJS(haptic)(over.value ? 'threshold' : 'release');
          }
        })
        .onEnd(event => {
          const reach = Math.abs(event.translationX);
          const thrown = Math.abs(event.velocityX) > FLING && Math.sign(event.velocityX) === Math.sign(event.translationX) && reach > threshold * 0.4;
          if (reach > threshold || thrown) runOnJS(toggle)();
          over.value = false;
          armed.value = withTiming(0, { duration: duration.short, easing: standard });
          runOnJS(setPast)(false);
          // The row goes back to its place with the hand's speed, whatever was decided.
          x.value = withSpring(0, { ...spatial, velocity: event.velocityX * (reach > threshold ? RESIST : 1) }, finished => {
            if (finished) {
              runOnJS(setLifted)(false);
              runOnJS(setHeld)(null);
            }
          });
        }),
    [pending, done, threshold, toggle, x, over, armed],
  );

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const hole = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(x.value), [0, 12], [0, 1], Extrapolation.CLAMP) }));
  const start = useAnimatedStyle(() => ({ opacity: x.value > 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: 0.88 + 0.12 * armed.value }] }));
  const end = useAnimatedStyle(() => ({ opacity: x.value < 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: 0.88 + 0.12 * armed.value }] }));
  const frame = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!link) return null;

  // Pending with nobody to read it is a plain link, not a reading that never ends.
  const failed = link.status === 'failed';
  const text = linkRowText(link);
  const price = link.price !== null ? formatPrice(link.price, link.currency) : null;
  const kept = source && source.uri !== unloaded ? source : null;
  const image = kept ?? (link.imageUrl ? { uri: link.imageUrl } : null);
  const undoing = held ?? done;
  const verb = undoing ? t('À faire') : stampWord(link.kind);
  // Stamping turns "done" on: matcha. Putting it back to do turns it off: the plain well.
  const holeInk = undoing ? theme.color.ink : theme.color.onActionContainer;
  const glyph = undoing ? 'undo' : 'stamp';

  return (
    <View style={styles.slot}>
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
            accessibilityLabel={[text.title, text.source, price].filter(Boolean).join(', ')}
            accessibilityActions={pending ? undefined : [{ name: 'stamp', label: done ? t('Remettre à faire') : t('Marquer : {stamp}', { stamp: stampWord(link.kind).toLowerCase() }) }]}
            onAccessibilityAction={toggle}
            outline={outline}
            style={styles.row}
          >
            <AnimatedOrganic outline="frame" style={[styles.image, image ? styles.picture : null, frame]}>
              {image ? (
                <Image source={image} style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]} resizeMode="cover" onError={kept ? () => setUnloaded(kept.uri) : undefined} />
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
                  <AppText variant="meta">{t('Lecture de la page…')}</AppText>
                </View>
              ) : failed ? (
                <View style={styles.failed}>
                  <Icon name="alert" size={14} color={theme.color.danger} />
                  <AppText variant="meta" numberOfLines={1} style={styles.shrink}>
                    {link.error ? t(link.error) : t('Lecture impossible')}
                  </AppText>
                  {reading ? (
                    <Tappable onPress={() => reanalyzeLink(id)} accessibilityLabel={t('Relire la page')} hitSlop={RETRY_SLOP} style={styles.retry}>
                      <AppText variant="metaStrong" color={theme.color.link}>
                        {t('Réessayer')}
                      </AppText>
                    </Tappable>
                  ) : null}
                </View>
              ) : text.facts.length > 0 ? (
                <AppText variant="meta" numberOfLines={1}>
                  {text.facts.join(' · ')}
                </AppText>
              ) : null}
            </View>
            {/* The page itself, one tap away from the list; the rest of the row opens what was kept of it. */}
            <IconButton icon="external" label={t('Ouvrir le lien')} shape={1} onPress={() => Linking.openURL(link.url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }))} />
          </Tappable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Inset by 6 so its press, an organic pebble, stays inside the page's margin.
    slot: { marginHorizontal: 6 },
    // The open button's own margin ends the row: its glyph sits 16 in, as the text would.
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 10, paddingRight: 4, paddingVertical: 10, minHeight: LINK_IMAGE.height + 20 },
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
    reading: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 18 },
    failed: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 18 },
    retry: { justifyContent: 'center', paddingHorizontal: 4 },
    flex: { flex: 1 },
    shrink: { flexShrink: 1 },
  });

export const LinkRow = memo(LinkRowComponent);
