/**
 * Every app's bin, as Carnet's (DESIGN's The Bin): what it holds on paper, one card each, the last
 * binned first; once, in meta under the title, how long things stay; empty, the `trash` collage and
 * how long they would. A card opens its record (whose page says it is in the bin, with « Restaurer »),
 * and holds its two acts outside that press: « Restaurer » (tonal, `restore`; the app's slip says it
 * with « Annuler ») and `trash` (deleted for good, the app asking first). The screen's top bar holds
 * « Vider la corbeille » (`broom`) while it holds something.
 *
 * The list moves as every list does: a card restored or deleted fades where it was and the others
 * close ranks; one brought back by « Annuler » settles in once they have made room; what is there
 * when the bin opens, or scrolls into view, simply is.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { concentric, RADII } from '@unlease/design/shapes';

import { listIn, listMove, listOut, listPressDelay } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Grain } from './Grain';
import { IconButton } from './IconButton';
import { Organic } from './Organic';
import { ScrollEdges } from './ScrollEdges';
import { Tappable } from './Tappable';
import { useArrivals } from './useArrivals';

/** The card's rows lie this far in from its edge, so their press stays inside its corners. */
const INSET = 6;
/** The press's corners: the card's own curve on the side it shares with it, a row's by the buttons. */
const PRESS = corners([concentric(RADII.card, INSET), RADII.row, RADII.row, concentric(RADII.card, INSET)]);

export interface BinRowProps {
  /** The record's name, as shown (« Sans titre » already said). */
  readonly title: string;
  /** When it went in, and what else tells it apart (an event's day), in meta. */
  readonly meta: string;
  /** Its mark in the row's 40 slot: a face, an emoji, a glyph. */
  readonly leading?: React.ReactNode;
  /** Opens the record, whose page says it is in the bin. */
  readonly onOpen?: () => void;
  readonly onRestore: () => void;
  /** Deletes it for good: the app asks first. */
  readonly onDelete: () => void;
}

function BinRowComponent({ title, meta, leading, onOpen, onRestore, onDelete }: BinRowProps) {
  const styles = useThemedStyles(makeStyles);
  const body = (
    <>
      {leading ? <View style={styles.mark}>{leading}</View> : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="meta" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
    </>
  );
  return (
    <Organic outline="card" style={styles.card}>
      <Grain />
      {onOpen ? (
        // Named by its title; TalkBack reads when it went in right after it. Its two acts stay out of its press.
        <Tappable unstable_pressDelay={listPressDelay} onPress={onOpen} accessibilityRole="button" accessibilityLabel={title} accessibilityValue={{ text: meta }} style={styles.press}>
          {body}
        </Tappable>
      ) : (
        <View style={styles.press}>{body}</View>
      )}
      <Button kind="tonal" small icon="restore" label={t('Restaurer')} accessibilityLabel={t('Restaurer {name}', { name: title })} onPress={onRestore} />
      <IconButton icon="trash" label={t('Supprimer définitivement {name}', { name: title })} shape={2} onPress={onDelete} />
    </Organic>
  );
}

export const BinRow = memo(BinRowComponent);

export interface BinListProps {
  /** What the bin holds, the last binned first. */
  readonly ids: readonly string[];
  /** Each one's card (a `BinRow`), or null for one gone meanwhile. */
  readonly renderRow: (id: string) => React.ReactElement | null;
  /** How long things stay, said once while it holds something (« Les … de la corbeille sont supprimés au bout de {days} jours. »). */
  readonly retention: string;
  /** The empty state's sentence: how long they would stay (« Les … supprimés y restent {days} jours, le temps de changer d’avis. »). */
  readonly emptyText: string;
}

function BinListComponent({ ids, renderRow, retention, emptyText }: BinListProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const arrived = useArrivals(ids);
  return (
    <ScrollEdges>
      <Animated.FlatList
        data={ids}
        keyExtractor={id => id}
        itemLayoutAnimation={listMove}
        skipEnteringExitingAnimations
        contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
        ListHeaderComponent={
          ids.length > 0 ? (
            <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
              {retention}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState scene="trash" title={t('La corbeille est vide')} text={emptyText} />}
        renderItem={({ item }) => (
          <Animated.View entering={arrived.has(item) ? listIn : undefined} exiting={listOut}>
            {renderRow(item)}
          </Animated.View>
        )}
      />
    </ScrollEdges>
  );
}

export const BinList = memo(BinListComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { flexGrow: 1 },
    // On the cards' words (their 12 from the screen, the rows' 6 and 10 inside them).
    notice: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8 },
    // A card of paper, as a note in Carnet's bin: one per record, 8 apart.
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginHorizontal: 12,
      marginBottom: 8,
      padding: INSET,
      backgroundColor: theme.color.paper,
      borderWidth: 1,
      borderColor: theme.color.hairline,
      boxShadow: theme.lift.card,
      overflow: 'hidden',
    },
    press: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 10, paddingVertical: 8, ...PRESS },
    mark: { width: 40, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, gap: 2 },
  });
