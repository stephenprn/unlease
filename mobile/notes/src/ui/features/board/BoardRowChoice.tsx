/**
 * Réglages' « Sous la barre de recherche », as Android lays out a choice among a few (a row showing the
 * value, its choices in a sheet; the maps apps' field): a field naming the row the board shows, its
 * line saying what that row holds; pressed, a sheet of the three rows, each a miniature of the board's
 * top with it (the search strip, then that row: collections on their stones, labels' tags, or the
 * filters with the first chosen), its name and its line, the current one ticked. A press applies and closes.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { RADII, SHAPES } from '@unlease/design/shapes';
import { BOARD_ROW_HINTS, BOARD_ROW_NAMES, BOARD_ROWS, type BoardRow } from '@unlease/notes/services/boardFilter';
import { selectBoardRow, setBoardRow, useLayoutStore } from '@app/store/layoutStore';

import { AppText, Icon, LabelTag, Organic, PickerField, Sheet, SHEET_INSET, SheetScroll, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** The miniature's pigments: three collections, three labels, as a board of anyone's might hold. */
const PIGMENTS: readonly LineColor[] = ['orange', 'blue', 'green'];

/** The board's shapes at about a third of their size: their radii follow, so each keeps its role. */
const SCALE = 0.36;
const scaled = (radius: number) => {
  const small = Math.round(radius * SCALE * 10) / 10;
  return corners([small, small, small, small]);
};

/** A line of words, as a bar in its ink. */
function Bar({ color, width }: { color: string; width: number }) {
  return <View style={[mini.bar, { backgroundColor: color, width }]} />;
}

/** The board's top with `row` under its search strip, drawn in the theme's colours: a picture, read with the name beside it. */
function BoardRowMiniature({ row }: { row: BoardRow }) {
  const theme = useTheme();
  const c = theme.color;
  const paperChip = [mini.chip, { backgroundColor: c.paper, borderColor: c.hairline }];
  return (
    <Organic outline="frame" style={[mini.frame, { borderColor: c.outline, backgroundColor: theme.ground.base }]}>
      <View style={mini.screen}>
        <Organic style={[mini.strip, { backgroundColor: c.field, borderColor: c.outline }]} />
        <View style={mini.chips}>
          {row === 'filters'
            ? [0, 1, 2, 3].map(index => (
                <Organic key={index} style={index === 0 ? [mini.chip, mini.filter, { backgroundColor: c.actionContainer, borderColor: c.actionContainer }] : [...paperChip, mini.filter]}>
                  <Bar color={index === 0 ? c.onActionContainer : c.inkMuted} width={index === 0 ? 8 : 10} />
                </Organic>
              ))
            : PIGMENTS.map(pigment => (
                <Organic key={pigment} style={paperChip}>
                  {row === 'collections' ? <Organic pebble={1} style={[mini.stone, { backgroundColor: theme.line[pigment].fill }]} /> : <LabelTag color={pigment} size={7} />}
                  <Bar color={c.inkMuted} width={10} />
                </Organic>
              ))}
        </View>
        <View style={mini.cards}>
          {[0, 1].map(index => (
            <Organic key={index} style={[mini.card, { backgroundColor: c.paper, borderColor: c.hairline }]}>
              <Bar color={c.ink} width={index === 0 ? 18 : 14} />
              <Bar color={c.inkMuted} width={22} />
            </Organic>
          ))}
        </View>
      </View>
    </Organic>
  );
}

/** Réglages' field: the row chosen, and under it what that row holds. */
export const BoardRowField = memo(function BoardRowField({ onOpen }: { onOpen: () => void }) {
  const row = useLayoutStore(selectBoardRow);
  return <PickerField label={t('Under the search bar')} value={t(BOARD_ROW_NAMES[row])} help={t(BOARD_ROW_HINTS[row])} onPress={onOpen} />;
});

/** The sheet of the three rows, mounted at the screen's root (a sheet cannot live inside its scroll). */
export const BoardRowSheet = memo(function BoardRowSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const chosen = useLayoutStore(selectBoardRow);
  return (
    <Sheet visible={visible} onDismiss={onClose} title={t('Under the search bar')}>
      <SheetScroll>
        <View accessibilityRole="radiogroup" style={styles.list}>
          {BOARD_ROWS.map(row => {
            const current = row === chosen;
            return (
              <Tappable
                key={row}
                accessibilityRole="radio"
                accessibilityState={{ checked: current }}
                accessibilityLabel={`${t(BOARD_ROW_NAMES[row])}, ${t(BOARD_ROW_HINTS[row])}`}
                onPress={() => {
                  if (!current) setBoardRow(row);
                  onClose();
                }}
                style={styles.option}
              >
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <BoardRowMiniature row={row} />
                </View>
                <View style={styles.words}>
                  <AppText variant="bodyStrong">{t(BOARD_ROW_NAMES[row])}</AppText>
                  <AppText variant="meta" color={theme.color.inkMuted}>
                    {t(BOARD_ROW_HINTS[row])}
                  </AppText>
                </View>
                <View style={styles.mark}>{current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}</View>
              </Tappable>
            );
          })}
        </View>
      </SheetScroll>
    </Sheet>
  );
});

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    list: { paddingHorizontal: SHEET_INSET - 12, paddingBottom: 8 },
    // A row as a list row is: its press inside its own corners, the miniature where a list row's glyph stands.
    option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 10, ...corners(SHAPES.tab) },
    words: { flex: 1, gap: 2 },
    mark: { width: 24, alignItems: 'center' },
  });

/** The miniature's shapes: the real ones' roles at its scale. */
const mini = StyleSheet.create({
  frame: { width: 96, height: 64, overflow: 'hidden', borderWidth: 1 },
  screen: { flex: 1, padding: 6, gap: 4 },
  bar: { height: 2.5, borderRadius: 1 },
  strip: { height: 10, borderWidth: 1, ...scaled(RADII.bar) },
  chips: { flexDirection: 'row', gap: 3 },
  chip: { height: 10, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 3, borderWidth: 0.75, ...scaled(RADII.chip) },
  filter: { width: 18, justifyContent: 'center' },
  stone: { width: 6, height: 6 },
  cards: { flexDirection: 'row', gap: 4, marginTop: 1 },
  card: { flex: 1, height: 28, gap: 3, paddingHorizontal: 4, paddingTop: 4, borderWidth: 0.75, ...scaled(RADII.card) },
});
