/**
 * The top of the board: the suite's search strip (`SearchHeader`, pinned), and under it, at the
 * head of the wall and scrolling away with it, the sync line, then the one row Réglages chose
 * (`BoardRow`): a chip per collection (its emblem, name and count) ending in a dashed
 * "+ Collection", a chip per label (its tag, name and count), or the board's filters (« Toutes »,
 * « Cette semaine », « À faire », « Listes », each with its count). While notes are picked the
 * selection bar lies over the strip and the chips rest: nothing moves.
 */
import React, { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StyleSheet, View } from 'react-native';

import { parseHex } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { plural } from '@unlease/core/services/format';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { isLockedNote } from '@unlease/notes/services/lock';
import { BOARD_FILTER_NAMES, BOARD_FILTERS, type BoardFilter } from '@unlease/notes/services/boardFilter';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EdgeScrollView, EmblemStone, FilterChip, Icon, LabelTag, Organic, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export { SearchHeader as BoardHeader, SEARCH_HEIGHT, SEARCH_TOP, SyncLine } from '@shared/ui/components/SearchHeader';

export interface LineChipsProps {
  readonly onOpenLine: (id: string) => void;
  readonly onNewLine: () => void;
  /** Notes are being picked: the chips rest while the selection bar is up. */
  readonly selecting: boolean;
}

/** The collections as chips, at the head of the wall: they scroll away with it, so only the strip stays pinned. */
function LineChipsComponent({ onOpenLine, onNewLine, selecting }: LineChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const lines = useLines();
  return (
    <View pointerEvents={selecting ? 'none' : 'auto'} style={selecting ? styles.resting : null}>
      <EdgeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} keyboardShouldPersistTaps="handled">
        {lines.map(line => (
          <LineChip key={line.id} id={line.id} onPress={onOpenLine} />
        ))}
        <Tappable accessibilityLabel={t('New collection')} onPress={onNewLine} style={styles.newLine}>
          <Icon name="plus" size={18} color={theme.color.link} />
          <AppText variant="label" color={theme.color.link}>
            {t('Collection')}
          </AppText>
        </Tappable>
      </EdgeScrollView>
    </View>
  );
}

const LineChip = memo(function LineChipView({ id, onPress }: { id: string; onPress: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const note = useLibraryStore(s => s.notes[id]);
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length);
  if (!note) return null;
  if (id === INBOX_ID && count === 0) return null;
  // A capsule of paper, its collection's emblem on its own stone at the left end.
  return (
    <Organic style={styles.chip}>
      <Tappable accessibilityLabel={`${shownTitle(note)}, ${plural(count, 'link')}`} onPress={() => onPress(id)} style={styles.chipPress}>
        <EmblemStone id={id} emblem={collectionEmblem(id, note.emblem)} color={asLineColor(note.color)} size={21} width={36} height={32} />
        <AppText variant="label" numberOfLines={1} style={styles.chipName}>
          {shownTitle(note)}
        </AppText>
        <AppText variant="labelSmall" color={styles.count.color}>
          {count}
        </AppText>
      </Tappable>
    </Organic>
  );
});

export interface LabelChipsProps {
  readonly onOpenLabel: (id: string) => void;
  readonly selecting: boolean;
}

/** The labels as chips, in their order, each with how many notes of the board wear it: a tap shows them. */
function LabelChipsComponent({ onOpenLabel, selecting }: LabelChipsProps) {
  const styles = useThemedStyles(makeStyles);
  const ids = useLibraryStore(useShallow(s => s.labelOrder.filter(id => s.labels[id] && s.labels[id]!.deletedAt === null)));
  if (ids.length === 0) return null;
  return (
    <View pointerEvents={selecting ? 'none' : 'auto'} style={selecting ? styles.resting : null}>
      <EdgeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} keyboardShouldPersistTaps="handled">
        {ids.map(id => (
          <LabelChip key={id} id={id} onPress={onOpenLabel} />
        ))}
      </EdgeScrollView>
    </View>
  );
}

/** The notes the board shows that wear a label: live, neither binned, archived nor protected. */
const labelCount = (s: ReturnType<typeof useLibraryStore.getState>, id: string): number => {
  let count = 0;
  for (const nid of s.noteOrder) {
    const note = s.notes[nid];
    if (note && note.deletedAt === null && note.trashedAt === null && !note.archived && !isLockedNote(note) && note.labelIds.includes(id)) count += 1;
  }
  return count;
};

const LabelChip = memo(function LabelChipView({ id, onPress }: { id: string; onPress: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const label = useLibraryStore(s => s.labels[id]);
  const count = useLibraryStore(s => labelCount(s, id));
  if (!label) return null;
  // The collection chip's capsule of paper, the label's tag where a collection has its stone.
  return (
    <Organic style={styles.chip}>
      <Tappable accessibilityLabel={`${label.name}, ${plural(count, 'note')}`} onPress={() => onPress(id)} style={[styles.chipPress, styles.labelPress]}>
        <LabelTag color={label.color} size={18} />
        <AppText variant="label" numberOfLines={1} style={styles.chipName}>
          {label.name}
        </AppText>
        <AppText variant="labelSmall" color={styles.count.color}>
          {count}
        </AppText>
      </Tappable>
    </Organic>
  );
});

export const LabelChips = memo(LabelChipsComponent);

export interface BoardFiltersProps {
  readonly filter: BoardFilter;
  readonly counts: Readonly<Record<BoardFilter, number>>;
  readonly onFilter: (filter: BoardFilter) => void;
  readonly selecting: boolean;
}

/** The board's filters, the row under the strip when Réglages chose them: a radio group of chips, scrolling sideways when the screen is narrow. */
function BoardFiltersComponent({ filter, counts, onFilter, selecting }: BoardFiltersProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View pointerEvents={selecting ? 'none' : 'auto'} style={selecting ? styles.resting : null}>
      <EdgeScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="radiogroup">
        {BOARD_FILTERS.map(each => (
          <FilterChip key={each} checked={filter === each} label={t(BOARD_FILTER_NAMES[each])} count={counts[each]} onPress={() => onFilter(each)} />
        ))}
      </EdgeScrollView>
    </View>
  );
}

export const BoardFilters = memo(BoardFiltersComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // 12 under the strip with the header's own 6, as when the chips were pinned.
    lines: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 8, alignItems: 'center' },
    resting: { opacity: 0.4 },
    // The collections' row's room: the one row under the strip, whichever it is.
    filters: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 8, alignItems: 'center' },
    // It clips its press to its own shape.
    chip: { ...corners(SHAPES.chip), backgroundColor: `rgba(${parseHex(theme.color.paper).join(', ')}, 0.82)`, borderWidth: 1, borderColor: theme.color.hairline, maxWidth: 230, overflow: 'hidden' },
    // 42 inside the chip's own 1 edge: 44 in all, as tall as the dashed « + Collection » beside it (its edge drawn on its 44).
    chipPress: { height: 42, paddingLeft: 5, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
    chipName: { flexShrink: 1 },
    // A tag is smaller than a stone: the chip's own 14 before it, as a plain chip's.
    labelPress: { paddingLeft: 14 },
    count: { color: theme.color.inkMuted },
    // The dashed affordance: an ink edge, the label in deep terracotta.
    newLine: {
      height: 44,
      paddingLeft: 14,
      paddingRight: 16,
      ...corners(SHAPES.dashed),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.color.dashed,
    },
  });

export const LineChips = memo(LineChipsComponent);
