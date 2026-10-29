/**
 * A table with typed columns, on the phone: a frame of paper that scrolls sideways inside the page,
 * its first column held in place while the others slide under it (so a row keeps its name), the
 * right edge fading while columns hide past it. A cell shows its value as its type reads it; a
 * press opens it in a sheet (a box ticks in place), a long press offers its row's actions; a
 * column's head opens its settings; the head's « + » adds a column, « Nouvelle ligne » a row.
 * Held, the frame around the cells (the head row, « Nouvelle ligne ») opens the table's own actions.
 * The sheets are drawn by the page screen's `TableSheetHost`.
 */
import React, { memo, useCallback, useState } from 'react';
import { Linking, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { parseHex } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import type { Block, CellValue, TableColumn } from '@unlease/notes/models/blocks';
import { CELL_FORMATS, cellFits, cellText, columnType, formatNumberCell } from '@unlease/notes/services/table';
import { prettyUrl } from '@unlease/core/services/url';
import { useLibraryStore } from '@app/store/libraryStore';
import { addColumn, addRow, setCell } from '@app/store/pages';
import { haptic } from '@platform/haptics';

import { AppText, Checkbox, Icon, IconButton, Organic, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { flushAll } from './editorStore';
import { usePageContext } from './PageContext';
import { openPageSheet } from './sheetStore';
import { cellAddress, chosenOptions, COLUMN_ICONS, OptionChip, widthOf } from './TableParts';
import { openTableSheet } from './TableSheetStore';

const NO_ROWS: readonly string[] = [];
/** The last cell of each row: the head's « + ». */
const END = 52;
/** The fade over the right edge while columns hide past it. */
const FADE = 36;
const CELL_LINES = 4;

/** What a cell shows: chips for choices, a number at its right edge, an address in link ink, words; a value its type no longer takes keeps its words beside a danger mark. */
const CellView = memo(function CellViewBody({ column, value }: { column: TableColumn; value: CellValue | undefined }) {
  const theme = useTheme();
  const type = columnType(column);
  if (type === 'select' || type === 'multi') {
    const options = chosenOptions(type, value).flatMap(id => column.options?.find(option => option.id === id) ?? []);
    return (
      <View style={styles.chips}>
        {options.map(option => (
          <OptionChip key={option.id} option={option} />
        ))}
      </View>
    );
  }
  if (type === 'number') {
    return (
      <AppText variant="cardBody" numberOfLines={1} style={styles.number}>
        {typeof value === 'number' ? formatNumberCell(value, column.unit) : ''}
      </AppText>
    );
  }
  const text = cellText(value, column);
  if (CELL_FORMATS[type] && !cellFits(value, column)) {
    return (
      <View style={styles.misfit}>
        <AppText variant="cardBody" numberOfLines={CELL_LINES} style={styles.misfitText}>
          {text}
        </AppText>
        <Icon name="alert" size={14} color={theme.color.danger} />
      </View>
    );
  }
  // An address in link ink, without the underline: a cut text cannot carry one on React Native 0.88.
  if (cellAddress(column, value)) {
    return (
      <AppText variant="cardBody" numberOfLines={CELL_LINES} color={theme.color.link}>
        {type === 'url' ? prettyUrl(text) : text}
      </AppText>
    );
  }
  return (
    <AppText variant="cardBody" numberOfLines={CELL_LINES}>
      {text}
    </AppText>
  );
});

/** The first column, held at the left edge while the rest scroll under it. */
function Held({ scrollX, style, children }: { scrollX: SharedValue<number>; style: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const held = useAnimatedStyle(() => ({ transform: [{ translateX: scrollX.value }] }));
  return <Animated.View style={[style, held]}>{children}</Animated.View>;
}

interface CellProps {
  readonly table: string;
  readonly rowId: string;
  readonly column: TableColumn;
  readonly value: CellValue | undefined;
  readonly width: number;
  readonly index: number;
  readonly scrollX: SharedValue<number>;
}

const Cell = memo(function CellBody({ table, rowId, column, value, width, index, scrollX }: CellProps) {
  const themed = useThemedStyles(makeStyles);
  const { page, readOnly } = usePageContext();
  const type = columnType(column);
  const address = cellAddress(column, value);
  const text = cellText(value, column);
  const format = CELL_FORMATS[type];
  const shown = text || t('vide');
  const label = format && !cellFits(value, column) ? t('{column} : {value} (ce n’est pas {expected})', { column: column.name, value: shown, expected: t(format.expected) }) : t('{column} : {value}', { column: column.name, value: shown });
  const body =
    type === 'checkbox' ? (
      <View style={styles.box}>
        <Checkbox checked={value === true} label={value === true ? t('{column} : coché', { column: column.name }) : t('{column} : non coché', { column: column.name })} disabled={readOnly} onToggle={() => setCell(page, rowId, column.id, value !== true)} />
      </View>
    ) : (
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={readOnly ? undefined : t('Toucher pour modifier, maintenir pour les actions de la ligne')}
        disabled={readOnly && !address}
        onPress={() => {
          if (!readOnly) openTableSheet({ kind: 'cell', page, table, row: rowId, column: column.id });
          else if (address) Linking.openURL(address).catch(() => {});
        }}
        onLongPress={
          readOnly
            ? undefined
            : () => {
                haptic('pick');
                openTableSheet({ kind: 'row', page, table, row: rowId });
              }
        }
        style={styles.press}
      >
        <CellView column={column} value={value} />
      </Tappable>
    );
  const frame = [styles.cell, { width }, index === 0 ? themed.held : index > 1 ? themed.divided : null];
  return index === 0 ? (
    <Held scrollX={scrollX} style={frame}>
      {body}
    </Held>
  ) : (
    <View style={frame}>{body}</View>
  );
});

interface RowProps {
  readonly table: string;
  readonly id: string;
  readonly columns: readonly TableColumn[];
  readonly widths: readonly number[];
  readonly end: number;
  /** The frame's own edge closes the last row when nothing follows it. */
  readonly closed: boolean;
  readonly scrollX: SharedValue<number>;
}

const Row = memo(function RowView({ table, id, columns, widths, end, closed, scrollX }: RowProps) {
  const themed = useThemedStyles(makeStyles);
  const cells = useLibraryStore(s => s.blocks[id]?.cells);
  if (!cells) return null;
  return (
    <View style={[themed.row, closed ? styles.closed : null]}>
      {columns.map((column, index) => (
        <Cell key={column.id} table={table} rowId={id} column={column} value={cells[column.id]} width={widths[index]!} index={index} scrollX={scrollX} />
      ))}
      {end > 0 ? <View style={{ width: end }} /> : null}
    </View>
  );
});

/** `onHold`: the table's own actions, a hold on the head row away from the cells. */
const ColumnHead = memo(function ColumnHeadView({ table, column, width, index, scrollX, onHold }: { table: string; column: TableColumn; width: number; index: number; scrollX: SharedValue<number>; onHold: () => void }) {
  const themed = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const type = columnType(column);
  const head = (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={t('Colonne {name}', { name: column.name })}
      accessibilityHint={t('Toucher pour les réglages de la colonne, maintenir pour les actions du tableau')}
      disabled={readOnly}
      ownDisabled
      onPress={() => openTableSheet({ kind: 'column', page, table, column: column.id })}
      onLongPress={onHold}
      style={styles.headPress}
    >
      <Icon name={COLUMN_ICONS[type]} size={16} color={theme.color.inkMuted} />
      <AppText variant="metaStrong" numberOfLines={1} style={styles.headName}>
        {column.name}
      </AppText>
      {type === 'number' && column.unit ? (
        <AppText variant="meta" numberOfLines={1}>
          {column.unit}
        </AppText>
      ) : null}
    </Tappable>
  );
  const frame = [styles.cell, { width }, index === 0 ? themed.held : index > 1 ? themed.divided : null];
  return index === 0 ? (
    <Held scrollX={scrollX} style={frame}>
      {head}
    </Held>
  ) : (
    <View style={frame}>{head}</View>
  );
});

function TableBlockComponent({ block }: { block: Block }) {
  const themed = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const rows = useLibraryStore(s => s.blocksByParent[block.id]) ?? NO_ROWS;
  const columns = block.columns;
  const [available, setAvailable] = useState(0);
  const scrollX = useSharedValue(0);
  const viewport = useSharedValue(0);
  const content = useSharedValue(0);

  // Narrower than the page, the columns widen in proportion to fill it; wider, the table scrolls.
  const end = readOnly ? 0 : END;
  const natural = columns.map(widthOf);
  const sum = natural.reduce((total, width) => total + width, 0);
  const stretch = available > 0 && sum > 0 && sum + end < available ? (available - end) / sum : 1;
  const widths = natural.map(width => Math.floor(width * stretch));

  const onScroll = useAnimatedScrollHandler(event => {
    scrollX.value = event.contentOffset.x;
  });
  const fade = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (content.value - viewport.value - scrollX.value) / FADE)) }));
  const [r, g, b] = parseHex(theme.color.paper);

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    viewport.value = width;
    setAvailable(width);
  };

  const addAndName = () => {
    const added = addColumn(page, block.id);
    if (added) openTableSheet({ kind: 'column', page, table: block.id, column: added });
  };

  // A hold on a cell is its row's: the block's actions are held on the frame around the cells.
  const holdTable = useCallback(() => {
    haptic('pick');
    flushAll();
    openPageSheet({ kind: 'block', block: block.id });
  }, [block.id]);

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
              {columns.map((column, index) => (
                <ColumnHead key={column.id} table={block.id} column={column} width={widths[index]!} index={index} scrollX={scrollX} onHold={holdTable} />
              ))}
              {readOnly ? null : (
                <View style={styles.end}>
                  <IconButton icon="plus" label={t('Ajouter une colonne')} size={20} shape={1} onPress={addAndName} onLongPress={holdTable} />
                </View>
              )}
            </View>
            {rows.map((id, index) => (
              <Row key={id} table={block.id} id={id} columns={columns} widths={widths} end={end} closed={readOnly && index === rows.length - 1} scrollX={scrollX} />
            ))}
          </View>
        </Animated.ScrollView>
        <Animated.View pointerEvents="none" style={[styles.fade, { backgroundImage: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0), rgba(${r}, ${g}, ${b}, 1))` }, fade]} />
      </View>
      {readOnly ? null : (
        <Tappable accessibilityRole="button" accessibilityLabel={t('Nouvelle ligne')} accessibilityHint={t('Maintenir pour les actions du tableau')} onPress={() => addRow(page, block.id)} onLongPress={holdTable} style={styles.addRow}>
          <Icon name="plus" size={18} color={theme.color.link} />
          <AppText variant="label" color={theme.color.link}>
            {t('Nouvelle ligne')}
          </AppText>
        </Tappable>
      )}
    </Organic>
  );
}

const styles = StyleSheet.create({
  cell: { alignSelf: 'stretch' },
  // Each cell presses inside its own small sheet, a little in from the grid's lines.
  press: { flex: 1, minHeight: 44, margin: 2, paddingHorizontal: 8, paddingVertical: 11, justifyContent: 'center', ...corners(SHAPES.small) },
  box: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  headPress: { minHeight: 40, margin: 2, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6, ...corners(SHAPES.small) },
  headName: { flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  number: { textAlign: 'right' },
  misfit: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  misfitText: { flexShrink: 1 },
  end: { width: END, alignItems: 'center', justifyContent: 'center' },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE },
  closed: { borderBottomWidth: 0 },
  addRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // A frame of paper, edged in the hairline, its content clipped to its corner.
    frame: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, overflow: 'hidden' },
    headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.color.outline },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.color.hairline },
    // The held column covers what slides under it, a hairline at its edge.
    held: { zIndex: 1, backgroundColor: theme.color.paper, borderRightWidth: 1, borderRightColor: theme.color.hairline },
    divided: { borderLeftWidth: 1, borderLeftColor: theme.color.hairline },
  });

export const TableBlock = memo(TableBlockComponent);
