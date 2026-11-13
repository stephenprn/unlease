/**
 * The top of the board: the suite's search strip (`SearchHeader`, pinned), and under it, at the
 * head of the wall and scrolling away with it, the sync line, then a chip per collection (its
 * emblem, name and count) ending in a dashed "+ Collection". While notes are picked the selection
 * bar lies over the strip and the chips rest: nothing moves.
 */
import React, { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { parseHex } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { plural } from '@unlease/core/services/format';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmblemStone, Icon, Organic, Tappable } from '../../components';
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lines} keyboardShouldPersistTaps="handled">
        {lines.map(line => (
          <LineChip key={line.id} id={line.id} onPress={onOpenLine} />
        ))}
        <Tappable accessibilityLabel={t('New collection')} onPress={onNewLine} style={styles.newLine}>
          <Icon name="plus" size={18} color={theme.color.link} />
          <AppText variant="label" color={theme.color.link}>
            {t('Collection')}
          </AppText>
        </Tappable>
      </ScrollView>
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // 12 under the strip with the header's own 6, as when the chips were pinned.
    lines: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 8, alignItems: 'center' },
    resting: { opacity: 0.4 },
    // It clips its press to its own shape.
    chip: { ...corners(SHAPES.chip), backgroundColor: `rgba(${parseHex(theme.color.paper).join(', ')}, 0.82)`, borderWidth: 1, borderColor: theme.color.hairline, maxWidth: 230, overflow: 'hidden' },
    // 42 inside the chip's own 1 edge: 44 in all, as tall as the dashed « + Collection » beside it (its edge drawn on its 44).
    chipPress: { height: 42, paddingLeft: 5, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
    chipName: { flexShrink: 1 },
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
