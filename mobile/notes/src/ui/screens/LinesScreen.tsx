/** Every collection as a pinned tile: its emblem, what it holds and for whom Claude files; "Non classé" last. */
import React, { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { formatPrice, plural, totalPrice } from '@unlease/core/services/format';
import { INBOX_ID, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { t } from '@unlease/core/i18n';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmblemStone, Grain, Ground, Icon, IconButton, Organic, Tappable, TopBar } from '../components';
import { NewLineSheet } from '../features/lines/NewLineSheet';
import type { ScreenProps } from '../navigation/types';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

/** The dashed tile is a card to come: a card's outline, as the tiles beside it. */
const NEW_TILE = 'card';

const PADDING = 12;
const GAP = 10;
const NEW = '__new__';

export function LinesScreen({ navigation }: ScreenProps<'Lines'>) {
  const styles = useThemedStyles(makeStyles);
  const lines = useLines();
  const { width } = useWindowDimensions();
  const [creating, setCreating] = useState(false);
  const tile = (width - PADDING * 2 - GAP) / 2;
  const data = [...lines.map(line => line.id), NEW];
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Collections')} onBack={() => navigation.goBack()} actions={<IconButton icon="plus" label={t('Nouvelle collection')} onPress={() => setCreating(true)} />} />
      <FlatList
        data={data}
        keyExtractor={id => id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <AppText variant="body" style={styles.intro}>
            {t('Claude lit chaque lien que vous enregistrez et le range dans la collection qui lui correspond. La phrase de chaque collection l’aide à choisir.')}
          </AppText>
        }
        renderItem={({ item }) =>
          item === NEW ? (
            <Tappable onPress={() => setCreating(true)} accessibilityLabel={t('Nouvelle collection')} outline={NEW_TILE} style={[styles.add, { width: tile }]}>
              <Icon name="plus" size={28} color={styles.addText.color} />
              <AppText variant="bodyStrong" color={styles.addText.color}>
                {t('Nouvelle collection')}
              </AppText>
            </Tappable>
          ) : (
            <CollectionTile id={item} width={tile} onPress={() => navigation.navigate('Line', { id: item })} />
          )
        }
      />
      <NewLineSheet visible={creating} onDismiss={() => setCreating(false)} onCreated={id => navigation.navigate('Line', { id })} />
    </View>
  );
}

function CollectionTile({ id, width, onPress }: { id: string; width: number; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[id]);
  const { count, total } = useLibraryStore(
    useShallow(s => {
      const open = (s.linksByNote[id] ?? []).map(lid => s.links[lid]).filter(link => !!link && !link.done);
      const sum = totalPrice(open.map(link => ({ price: link!.price, currency: link!.currency })));
      return { count: open.length, total: sum ? formatPrice(sum.amount, sum.currency) : '' };
    }),
  );
  if (!line) return null;
  const inbox = id === INBOX_ID;
  return (
    <Organic outline="card" style={[styles.tile, { width }]}>
      <Tappable onPress={onPress} accessibilityLabel={`${shownTitle(line)}, ${plural(count, 'lien')}`} style={styles.press}>
        <Grain />
        <View style={styles.mark}>
          <EmblemStone id={id} emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={40} width={64} height={58} tilt={-6} />
        </View>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {shownTitle(line)}
        </AppText>
        <AppText variant="meta" numberOfLines={3} style={styles.hint}>
          {shownHint(line) || (inbox ? t('Ce que Claude ne sait pas où ranger.') : t('Ajoutez une phrase pour aider Claude à y ranger les bons liens.'))}
        </AppText>
        {/* The count recedes: the name leads, the sentence supports (as on the web). */}
        <AppText variant="meta" color={theme.color.inkMuted}>
          {[plural(count, 'lien'), total].filter(Boolean).join(' · ')}
        </AppText>
      </Tappable>
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    list: { paddingHorizontal: PADDING, paddingBottom: 32 },
    intro: { color: theme.color.inkMuted, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 16 },
    row: { gap: GAP, marginBottom: GAP },
    // It clips its paper's grain to its own shape; its shadow is drawn outside the clip.
    tile: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    press: { overflow: 'hidden', padding: 14, gap: 4, minHeight: 190 },
    mark: { alignSelf: 'flex-start', marginBottom: 10, marginLeft: -4 },
    hint: { flexGrow: 1 },
    // habits-garden's dashed affordance: an ink edge, the label in deep terracotta.
    add: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.color.dashed, padding: 14 },
    addText: { color: theme.color.link },
  });
