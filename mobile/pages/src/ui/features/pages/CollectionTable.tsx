/**
 * An embedded collection as a table, on the phone, as the web draws it: a row per link to do (then,
 * when the embed shows them, per link done), its title first with its picture, held at the left
 * edge while the other columns slide under it, then the columns the person keeps
 * (`pages/services/collectionTable`, in the order and with the choice the embed holds), and the
 * stamp at the row's end. A title opens the link in Carnet. Columns are moved and hidden from the
 * web; the phone reads them as they are kept.
 */
import React, { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import type { GlyphName } from '@unlease/design/glyphs';
import { parseHex } from '@unlease/design/palette';
import { pebbleTurn } from '@unlease/design/pebbles';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import type { Block } from '@unlease/pages/models/blocks';
import { arrangeColumns, collectionColumns, linkCell, type CollectionColumn } from '@unlease/pages/services/collectionTable';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import { useMinute } from '@shared/app/hooks/useMinute';
import { setLinkDone } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Icon, IconButton, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { stampWord } from '@carnet/ui/components/Stamp';
import { KIND_ICONS } from '@carnet/ui/features/links/kindIcon';
import { usePageContext } from './PageContext';
import { Held } from './TableBlock';

/** The title column, kept in view: room left for the next column on a phone (the web's phone-sized width). */
const TITLE_WIDTH = 190;
/** The web's widths for the link's own fields; a fact Claude read takes its own. */
const WIDTHS: Readonly<Record<string, number>> = { site: 150, kind: 120, price: 110, summary: 320, comment: 240, added: 110, url: 200 };
const FACT_WIDTH = 160;
const widthOf = (key: string): number => WIDTHS[key] ?? FACT_WIDTH;
/** The row's end: its stamp. */
const END = 52;
/** The right edge fades while columns hide past it. */
const FADE = 36;

const ICONS: Readonly<Record<string, GlyphName>> = { site: 'globe', kind: 'select', price: 'hash', summary: 'textAlign', comment: 'note', added: 'calendar', url: 'link' };
/** A fact Claude read: its spark. */
const iconOf = (key: string): GlyphName => ICONS[key] ?? 'sparkle';

/** The links' columns, in the order and with the choice this embed keeps; only those shown. */
function useShownColumns(block: Block, ids: readonly string[]): CollectionColumn[] {
  const links = useLibraryStore(useShallow(s => ids.flatMap(id => s.links[id] ?? [])));
  return useMemo(() => arrangeColumns(collectionColumns(links), block.viewColumns).filter(column => column.shown), [links, block.viewColumns]);
}

const LinkTableRow = memo(function LinkTableRow({ id, index, columns, spare, now, last, onOpen, scrollX }: { id: string; index: number; columns: readonly CollectionColumn[]; spare: number; now: number; last: boolean; onOpen: (id: string) => void; scrollX: SharedValue<number> }) {
  const themed = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { readOnly } = usePageContext();
  const link = useLibraryStore(s => s.links[id]);
  const kept = useBlobSource(link?.imageIds[0] ?? null);
  if (!link) return null;
  const { title } = linkRowText(link);
  const picture = kept ?? (link.imageUrl ? { uri: link.imageUrl } : null);
  const stamp = () => {
    const undo = setLinkDone(id, !link.done);
    showSnack(link.done ? t('Remis à faire') : t('Tamponné « {stamp} »', { stamp: stampWord(link.kind) }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };
  return (
    <View style={[themed.row, last ? styles.closed : null]}>
      <Held scrollX={scrollX} style={[styles.cell, { width: TITLE_WIDTH }, themed.held]}>
        <Tappable onPress={() => onOpen(id)} accessibilityRole="link" accessibilityLabel={title} style={styles.title}>
          <Organic pebble={pebbleTurn(index)} style={[themed.thumb, link.done ? styles.doneThumb : null]}>
            {picture ? <Image source={picture} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icon name={KIND_ICONS[link.kind]} size={16} color={theme.color.inkMuted} />}
          </Organic>
          {/* A title made from the address, before any reading, says so in the second ink. */}
          <AppText variant="bodyStrong" numberOfLines={2} color={link.title && !link.done ? undefined : theme.color.inkMuted} style={styles.titleText}>
            {title}
          </AppText>
        </Tappable>
      </Held>
      {columns.map((column, at) => (
        <View key={column.key} style={[styles.cell, { width: widthOf(column.key) + (at === columns.length - 1 ? spare : 0) }, at > 0 ? themed.divided : null]}>
          <AppText variant="body" numberOfLines={3} style={[styles.value, column.key === 'price' && link.price !== null ? styles.number : null]}>
            {linkCell(link, column.key, now)}
          </AppText>
        </View>
      ))}
      <View style={styles.end}>
        {readOnly ? null : <IconButton icon={link.done ? 'undo' : 'stamp'} label={link.done ? t('Remettre « {title} » à faire', { title }) : t('Marquer « {title} » : {stamp}', { title, stamp: stampWord(link.kind).toLowerCase() })} size={18} shape={1} onPress={stamp} />}
      </View>
    </View>
  );
});

function CollectionTableComponent({ block, ids, done, onOpen }: { block: Block; ids: readonly string[]; done: readonly string[]; onOpen: (id: string) => void }) {
  const themed = useThemedStyles(makeStyles);
  const theme = useTheme();
  const shownIds = useMemo(() => [...ids, ...done], [ids, done]);
  const columns = useShownColumns(block, shownIds);
  const now = useMinute();
  const [available, setAvailable] = useState(0);
  const scrollX = useSharedValue(0);
  const viewport = useSharedValue(0);
  const content = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    scrollX.value = event.contentOffset.x;
  });
  const fade = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (content.value - viewport.value - scrollX.value) / FADE)) }));
  const [r, g, b] = parseHex(theme.color.paper);
  const onLayout = (event: LayoutChangeEvent) => {
    viewport.value = event.nativeEvent.layout.width;
    setAvailable(event.nativeEvent.layout.width);
  };
  if (shownIds.length === 0) {
    return (
      <AppText variant="meta" style={styles.empty}>
        {t('Aucun lien à faire dans cette collection.')}
      </AppText>
    );
  }
  // Narrower than the embed, the last column takes what is left, so the rows' lines reach its edge.
  const natural = TITLE_WIDTH + columns.reduce((sum, column) => sum + widthOf(column.key), 0) + END;
  const spare = available > natural ? available - natural : 0;
  return (
    <Organic outline="frame" style={themed.frame}>
      <View onLayout={onLayout}>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={width => {
            content.value = width;
          }}
        >
          <View>
            <View style={themed.headRow}>
              <Held scrollX={scrollX} style={[styles.cell, { width: TITLE_WIDTH }, themed.held]}>
                <View style={styles.head}>
                  <Icon name="text" size={16} color={theme.color.inkMuted} />
                  <AppText variant="metaStrong" numberOfLines={1} style={styles.headName}>
                    {t('Titre')}
                  </AppText>
                </View>
              </Held>
              {columns.map((column, index) => (
                <View key={column.key} style={[styles.cell, { width: widthOf(column.key) + (index === columns.length - 1 ? spare : 0) }, index > 0 ? themed.divided : null]}>
                  <View style={styles.head}>
                    <Icon name={iconOf(column.key)} size={16} color={theme.color.inkMuted} />
                    <AppText variant="metaStrong" numberOfLines={1} style={styles.headName}>
                      {column.name}
                    </AppText>
                  </View>
                </View>
              ))}
              <View style={styles.end} />
            </View>
            {shownIds.map((id, index) => (
              <LinkTableRow key={id} id={id} index={index} columns={columns} spare={spare} now={now} last={index === shownIds.length - 1} onOpen={onOpen} scrollX={scrollX} />
            ))}
          </View>
        </Animated.ScrollView>
        <Animated.View pointerEvents="none" style={[styles.fade, { backgroundImage: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1))` }, fade]} />
      </View>
    </Organic>
  );
}

const styles = StyleSheet.create({
  cell: { alignSelf: 'stretch' },
  head: { minHeight: 38, margin: 3, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headName: { flexShrink: 1 },
  title: { flex: 1, minHeight: 48, margin: 3, paddingHorizontal: 7, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, ...corners(SHAPES.small) },
  titleText: { flex: 1 },
  value: { paddingHorizontal: 10, paddingVertical: 13 },
  number: { textAlign: 'right' },
  end: { width: END, alignItems: 'center', justifyContent: 'center' },
  closed: { borderBottomWidth: 0 },
  // A link done reads quieter, as on the web: its title in the second ink, its picture faded.
  doneThumb: { opacity: 0.55 },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE },
  empty: { paddingHorizontal: 16, paddingVertical: 12 },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // On the card's 16, as the choice of look over it and the collection's stone.
    frame: { marginHorizontal: 16, marginBottom: 8, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, overflow: 'hidden' },
    headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.color.outline },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.color.hairline },
    // The held column covers what slides under it, a hairline at its edge.
    held: { zIndex: 1, backgroundColor: theme.color.paper, borderRightWidth: 1, borderRightColor: theme.color.hairline },
    divided: { borderLeftWidth: 1, borderLeftColor: theme.color.hairline },
    thumb: { width: 28, height: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paperHigh },
  });

export const CollectionTable = memo(CollectionTableComponent);
