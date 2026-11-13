/**
 * Every collection as a pinned tile: its emblem, what it holds and for whom Claude files, a glimpse of
 * its links; "Non classé" last. A few dozen at most, so they hang in one wrap rather than a virtualised
 * grid: one leaving fades where it was and the others close ranks, one arriving settles in after them.
 */
import React, { memo, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { GEOMETRY } from '@unlease/design/palette';
import { pebbleTurn } from '@unlease/design/pebbles';
import { formatPrice, plural, totalPrice } from '@unlease/core/services/format';
import { INBOX_ID, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { t } from '@unlease/core/i18n';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';
import { useBlobSource } from '@shared/app/hooks/useImageSource';

import { AppText, EdgeScrollView, EmblemStone, Grain, Ground, Icon, IconButton, Organic, Tappable, TopBar, useArrivals } from '../components';
import { NewLineSheet } from '../features/lines/NewLineSheet';
import type { ScreenProps } from '../navigation/types';
import { listIn, listMove, listOut, listPressDelay } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** The dashed tile is a card to come: a card's outline, as the tiles beside it. */
const NEW_TILE = 'card';

/** The board's: its side margin and its cards' gap, so the tiles hang as the cards do. */
const PADDING = 12;
const GAP = GEOMETRY.gap;
const NEW = '__new__';
/** The pictures a tile glimpses, as on the web. */
const GLIMPSE = 3;
const GLIMPSE_SIZE = 44;

export function LinesScreen({ navigation }: ScreenProps<'Lines'>) {
  const styles = useThemedStyles(makeStyles);
  const lines = useLines();
  const { width } = useWindowDimensions();
  const [creating, setCreating] = useState(false);
  const tile = (width - PADDING * 2 - GAP) / 2;
  const data = [...lines.map(line => line.id), NEW];
  const arrived = useArrivals(data);
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Collections')} onBack={() => navigation.goBack()} actions={<IconButton icon="plus" label={t('New collection')} onPress={() => setCreating(true)} />} />
      <EdgeScrollView contentContainerStyle={styles.list}>
        <AppText variant="body" style={styles.intro}>
          {t('Claude reads each link you save and files it in the collection that fits. Each collection’s sentence helps it choose.')}
        </AppText>
        <View style={styles.grid}>
          {data.map(item => (
            <Animated.View key={item} layout={listMove} entering={arrived.has(item) ? listIn : undefined} exiting={listOut} style={{ width: tile }}>
              {item === NEW ? (
                <Tappable unstable_pressDelay={listPressDelay} onPress={() => setCreating(true)} accessibilityLabel={t('New collection')} outline={NEW_TILE} style={styles.add}>
                  <Icon name="plus" size={28} color={styles.addText.color} />
                  <AppText variant="bodyStrong" color={styles.addText.color}>
                    {t('New collection')}
                  </AppText>
                </Tappable>
              ) : (
                <CollectionTile id={item} onPress={() => navigation.navigate('Line', { id: item })} />
              )}
            </Animated.View>
          ))}
        </View>
      </EdgeScrollView>
      <NewLineSheet visible={creating} onDismiss={() => setCreating(false)} onCreated={id => navigation.navigate('Line', { id })} />
    </View>
  );
}

function CollectionTile({ id, onPress }: { id: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[id]);
  const { count, done, total, images } = useLibraryStore(
    useShallow(s => {
      const all = s.linksByNote[id] ?? [];
      const open = all.map(lid => s.links[lid]).filter(link => !!link && !link.done);
      const sum = totalPrice(open.map(link => ({ price: link!.price, currency: link!.currency })));
      const kept = open.map(link => link!.imageIds[0]).filter((blobId): blobId is string => !!blobId);
      return { count: open.length, done: all.filter(lid => s.links[lid]?.done).length, total: sum ? formatPrice(sum.amount, sum.currency) : '', images: kept.slice(0, GLIMPSE).join(',') };
    }),
  );
  if (!line) return null;
  const inbox = id === INBOX_ID;
  // What is left to do; all of it done, it says so rather than « 0 lien » (its page's heading).
  const holds = count === 0 && done > 0 ? t('Done · {count}', { count: done }) : [plural(count, 'link'), total].filter(Boolean).join(' · ');
  return (
    <Organic outline="card" style={styles.tile}>
      <Tappable unstable_pressDelay={listPressDelay} onPress={onPress} accessibilityLabel={`${shownTitle(line)}, ${holds}`} style={styles.press}>
        <Grain />
        <View style={styles.mark}>
          <EmblemStone id={id} emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={40} width={64} height={58} tilt={-6} />
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {shownTitle(line)}
        </AppText>
        <AppText variant="meta" numberOfLines={3} style={styles.hint}>
          {shownHint(line) || (inbox ? t('What Claude doesn’t know where to file.') : t('Add a sentence to help Claude file the right links here.'))}
        </AppText>
        {images ? (
          <View style={styles.glimpses}>
            {images.split(',').map((blobId, index) => (
              <Glimpse key={blobId} blobId={blobId} index={index} />
            ))}
          </View>
        ) : null}
        {/* The count recedes: the name leads, the sentence supports (as on the web). */}
        <AppText variant="meta" color={theme.color.inkMuted} style={styles.count}>
          {holds}
        </AppText>
      </Tappable>
    </Organic>
  );
}

/** A kept picture cropped to a pebble, a well until it loads; each its neighbour's other turn (the web's glimpse). */
const Glimpse = memo(function GlimpseView({ blobId, index }: { blobId: string; index: number }) {
  const source = useBlobSource(blobId);
  const theme = useTheme();
  return (
    <Organic pebble={pebbleTurn(index)} style={[glimpseStyles.glimpse, { backgroundColor: theme.color.paperHigh }]}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </Organic>
  );
});

const glimpseStyles = StyleSheet.create({
  glimpse: { width: GLIMPSE_SIZE, height: GLIMPSE_SIZE, overflow: 'hidden' },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    list: { paddingHorizontal: PADDING, paddingBottom: 32 },
    // On the screen's margin (16), in line with the top bar's Back.
    intro: { color: theme.color.inkMuted, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 16 },
    // Two tiles a row, as tall as the taller of the two.
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP, paddingBottom: GAP },
    // It clips its paper's grain to its own shape; its shadow is drawn outside the clip. It fills its slot.
    tile: { flexGrow: 1, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    press: { overflow: 'hidden', padding: 14, gap: 4, minHeight: 190 },
    mark: { alignSelf: 'flex-start', marginBottom: 10, marginLeft: -4 },
    hint: { flexGrow: 1 },
    // 10 from what is above them, pictures or not (the web's).
    glimpses: { flexDirection: 'row', gap: 6, marginTop: 6 },
    count: { marginTop: 6 },
    // habits-garden's dashed affordance: an ink edge, the label in deep terracotta.
    add: { flexGrow: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.color.dashed, padding: 14 },
    addText: { color: theme.color.link },
  });
