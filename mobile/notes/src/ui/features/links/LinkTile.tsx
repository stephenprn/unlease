/**
 * A link in its collection as a picture (`LineLayout` `gallery` or `mosaic`, the web's `LinkTile`):
 *
 * - `gallery`: its kept image large in a 4:5 frame, every tile alike so a list of shoes or films
 *   compares at a glance; under it where it comes from and what it costs, and what it is (two
 *   lines), the same strings as its row (`linkRowText`).
 * - `mosaic`: its image at its own proportions in one of two columns, a moodboard, its price on a
 *   paper tag in its corner; its reading, or what stopped it, on a paper strip at its foot. A link
 *   without a picture is a sheet of its words among them.
 *
 * Both: the stamp pressed on the picture once done (the frame faded as a done row's). Pressed, it
 * opens the link's page (where it is stamped); held, it moves to another collection, as a row.
 */
import React, { memo, useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeOut, Keyframe, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { priceChangeText } from '@unlease/notes/services/priceWatch';
import { peopleNames } from '@unlease/notes/services/noteMentions';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import { selectCanRead, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { showSnack } from '@shared/app/store/uiStore';
import { reanalyzeLink, setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AnimatedOrganic, AppText, Icon, Organic, Stamp, Tappable, stampWord } from '../../components';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { decelerate, duration, listPressDelay, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { SHAPES } from '@unlease/design/shapes';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { KIND_ICONS } from './kindIcon';
import { pictureRatio, rememberRatio } from './pictureRatios';

export type TileShape = 'gallery' | 'mosaic';

/** The tile's press veil runs this far around its picture and its words (a row's 6). */
export const TILE_INSET = 6;
/** « Réessayer » and « Lire la page » sit on an 18 high line: 48 under a finger. */
const RETRY_SLOP = { top: 15, bottom: 15, left: 4, right: 8 } as const;

const STAMP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 1.3 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const STAMP_OUT = FadeOut.duration(duration.short);

export interface LinkTileProps {
  readonly id: string;
  readonly shape: TileShape;
  /** The picture's width: the column's. */
  readonly width: number;
  readonly onOpen: (id: string) => void;
  readonly onLongPress?: (id: string) => void;
  /** The mosaic's piece, laid out: how tall it stands, for its column. */
  readonly onHeight?: (id: string, height: number) => void;
}

function LinkTileComponent({ id, shape, width, onOpen, onLongPress, onHeight }: LinkTileProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[id]);
  const reading = useSettingsStore(selectCanRead);
  const claude = useServerFeature('claude');
  const source = useBlobSource(link?.imageIds[0]);
  const [unloaded, setUnloaded] = useState<readonly string[]>([]);
  const [ratio, setRatio] = useState<number | null>(null);
  const [pressedHere, setPressedHere] = useState(false);
  const done = !!link?.done;
  const fade = useSharedValue(done ? 0.55 : 1);
  useEffect(() => {
    fade.value = withTiming(done ? 0.55 : 1, { duration: duration.medium, easing: standard });
  }, [done, fade]);
  const frameFade = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!link) return null;

  const mosaic = shape === 'mosaic';
  const pending = link.status === 'pending' && reading;
  const failed = link.status === 'failed';
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const text = linkRowText(link);
  const { price, priceChange, note } = text;
  const people = peopleNames(link.contactIds);
  const kept = source && !unloaded.includes(source.uri) ? source : null;
  const image = kept ?? (link.imageUrl && !unloaded.includes(link.imageUrl) ? { uri: link.imageUrl } : null);
  const words = mosaic && !image;
  const known = image ? (ratio ?? pictureRatio(image.uri)) : null;
  const frameHeight = mosaic ? (image ? width / (known ?? 0.8) : undefined) : width * 1.25;
  const changeInk = priceChange?.direction === 'down' && !done ? theme.color.ok : theme.color.inkMuted;
  const state = pending ? t('Lecture de la page…') : failed ? (link.error ? t(link.error) : t('Lecture impossible')) : done && link.doneAt ? t('{stamp} le {date}', { stamp: stampWord(link.kind), date: formatDay(link.doneAt, Date.now()) }) : null;

  const toggle = (): void => {
    setPressedHere(true);
    const undo = setLinkDone(id, !link.done);
    showSnack(link.done ? t('Remis à faire') : t('Tamponné « {stamp} »', { stamp: stampWord(link.kind) }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  const status = pending ? (
    <View style={styles.status}>
      <ReadingTrack width={56} />
      <AppText variant="meta" numberOfLines={1} style={styles.shrink}>
        {t('Lecture de la page…')}
      </AppText>
    </View>
  ) : failed ? (
    <View style={styles.status}>
      <Icon name="alert" size={14} color={theme.color.danger} />
      <AppText variant="meta" numberOfLines={1} style={styles.shrink}>
        {link.error ? t(link.error) : t('Lecture impossible')}
      </AppText>
      {claude ? (
        <Tappable onPress={() => reanalyzeLink(id)} accessibilityLabel={t('Relire la page')} hitSlop={RETRY_SLOP} style={styles.retry}>
          <AppText variant="metaStrong" color={theme.color.link}>
            {t('Réessayer')}
          </AppText>
        </Tappable>
      ) : null}
    </View>
  ) : unread && claude ? (
    <View style={styles.status}>
      <Tappable onPress={() => reanalyzeLink(id)} accessibilityLabel={t('Lire {title}', { title: text.title })} hitSlop={RETRY_SLOP} style={[styles.retry, styles.retryAlone]}>
        <AppText variant="metaStrong" color={theme.color.link}>
          {t('Lire la page')}
        </AppText>
      </Tappable>
    </View>
  ) : null;

  const overline = (
    <View style={styles.overline}>
      <AppText variant="metaStrong" numberOfLines={1} style={styles.flex}>
        {text.source}
      </AppText>
      {price && priceChange && !pending ? (
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
  );

  return (
    <Tappable
      unstable_pressDelay={listPressDelay}
      onPress={() => onOpen(id)}
      onLongPress={() => onLongPress?.(id)}
      accessibilityLabel={[text.title, text.source, pending ? null : price, pending || !priceChange ? null : priceChangeText(link, Date.now())?.text, people.length > 0 ? people.join(', ') : null, state, note ? t('Votre note : {note}', { note }) : null].filter(Boolean).join(', ')}
      accessibilityActions={[...(pending ? [] : [{ name: 'stamp', label: done ? t('Remettre à faire') : t('Marquer : {stamp}', { stamp: stampWord(link.kind).toLowerCase() }) }]), { name: 'open', label: t('Ouvrir le lien') }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'stamp') toggle();
        else Linking.openURL(link.url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));
      }}
      outline={mosaic ? 'frame' : 'card'}
      onLayout={mosaic && onHeight ? (event: LayoutChangeEvent) => onHeight(id, event.nativeEvent.layout.height) : undefined}
      style={mosaic ? styles.piece : [styles.tile, { width: width + 2 * TILE_INSET }]}
    >
      <View>
        <AnimatedOrganic outline="frame" style={[styles.frame, words ? styles.wordsFrame : null, image ? styles.picture : null, { width, height: frameHeight }, frameFade]}>
          {image ? (
            <Image
              source={image}
              style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]}
              resizeMode="cover"
              onError={() => setUnloaded(lost => [...lost, image.uri])}
              onLoad={event => {
                const { width: w, height: h } = event.nativeEvent.source;
                if (mosaic && w > 0 && h > 0) setRatio(rememberRatio(image.uri, w / h));
              }}
            />
          ) : words ? (
            <View style={styles.words}>
              <Icon name={KIND_ICONS[link.kind]} size={20} color={theme.color.inkMuted} />
              <View style={styles.wordsText}>
                {overline}
                <AppText variant="bodyStrong" numberOfLines={5} color={done || !link.title ? theme.color.inkMuted : undefined}>
                  {text.title}
                </AppText>
              </View>
              {status}
            </View>
          ) : done ? null : (
            <Icon name={KIND_ICONS[link.kind]} size={40} color={theme.color.inkMuted} />
          )}
          {/* What it costs on its picture's corner; what stops its reading on its foot, cut by the frame. */}
          {mosaic && image && price && !status ? (
            <Organic style={styles.priceTag} pointerEvents="none">
              <AppText variant="labelSmall" color={done ? theme.color.inkMuted : theme.color.ink}>
                {price}
              </AppText>
            </Organic>
          ) : null}
          {mosaic && image && status ? <View style={styles.strip}>{status}</View> : null}
        </AnimatedOrganic>
        {done && link.doneAt ? (
          <Animated.View entering={pressedHere ? STAMP_IN : undefined} exiting={STAMP_OUT} style={styles.stamp} pointerEvents="none">
            <View style={shape === 'gallery' ? styles.stampLarge : null}>
              <Stamp kind={link.kind} date={formatDay(link.doneAt, Date.now())} />
            </View>
          </Animated.View>
        ) : null}
      </View>
      {shape === 'gallery' ? (
        <View style={styles.text}>
          {overline}
          <AppText variant="bodyStrong" numberOfLines={2} color={done || !link.title ? theme.color.inkMuted : undefined}>
            {text.title}
          </AppText>
          {status}
        </View>
      ) : null}
    </Tappable>
  );
}

export const LinkTile = memo(LinkTileComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tile: { padding: TILE_INSET, gap: 10 },
    piece: {},
    frame: {
      overflow: 'hidden',
      backgroundColor: theme.color.paperHigh,
      borderWidth: 1,
      borderColor: theme.color.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A link without a picture: a sheet of its words, as tall as they are.
    wordsFrame: { backgroundColor: theme.color.paper, alignItems: 'stretch', justifyContent: 'flex-start' },
    // A picture lies on cream paper, as a row's does.
    picture: { backgroundColor: theme.color.paper, isolation: 'isolate' },
    photoDay: { mixBlendMode: 'multiply' },
    photoNight: { opacity: 0.86 },
    words: { padding: 14, gap: 10 },
    wordsText: { gap: 4 },
    stamp: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    stampLarge: { transform: [{ scale: 1.2 }] },
    priceTag: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 2, ...corners(SHAPES.detail), backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    // Over the picture's foot, the frame cutting its corners.
    strip: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.color.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    text: { gap: 2, paddingHorizontal: 2 },
    overline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 20 },
    change: { flexDirection: 'row', alignItems: 'center', gap: 1, marginRight: -4 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18, marginTop: 2 },
    retry: { justifyContent: 'center', paddingHorizontal: 4 },
    retryAlone: { marginLeft: -4 },
    flex: { flex: 1 },
    shrink: { flexShrink: 1 },
  });
