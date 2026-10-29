/** What the phone's table, its cells' sheet and its columns' sheet share: each type's glyph, a column's width, an option's chip. */
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { SHAPES } from '@unlease/design/shapes';
import { tx } from '@unlease/core/i18n';
import type { CellValue, ColumnType, SelectOption, TableColumn } from '@unlease/notes/models/blocks';
import { cellHref, cellText, columnType } from '@unlease/notes/services/table';

import { AppText, Organic } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

export const COLUMN_ICONS: Record<ColumnType, GlyphName> = {
  text: 'textAlign',
  number: 'hash',
  checkbox: 'box',
  url: 'link',
  email: 'email',
  phone: 'phoneCall',
  date: 'calendar',
  select: 'select',
  multi: 'multiSelect',
};

/** A column never widened by hand, at a phone's scale: narrow for a box or a number, wider for words. */
const DEFAULT_WIDTHS: Partial<Record<ColumnType, number>> = { checkbox: 64, number: 112, date: 132 };
const WIDEST = 280;

/** A column's width on the phone: the one set on the web, kept within a phone's reach. */
export function widthOf(column: TableColumn): number {
  const type = columnType(column);
  const set = column.width ?? DEFAULT_WIDTHS[type] ?? 148;
  return Math.round(Math.max(type === 'checkbox' ? 56 : 96, Math.min(WIDEST, set)));
}

/** The option ids a select or a multi-select cell holds. */
export function chosenOptions(type: ColumnType, value: CellValue | undefined): string[] {
  if (type === 'multi') return Array.isArray(value) ? [...value] : [];
  return typeof value === 'string' && value ? [value] : [];
}

/** The text a cell's field opens with: what it holds, as one types it. */
export function draftOf(type: ColumnType, value: CellValue | undefined, column: TableColumn): string {
  if (type === 'number') return typeof value === 'number' ? String(value).replace('.', ',') : '';
  if (type === 'date') return typeof value === 'string' ? value : '';
  return cellText(value, column);
}

/** A link, an e-mail or a telephone cell's address, made openable; null for any other. */
export function cellAddress(column: TableColumn, value: CellValue | undefined): string | null {
  const type = columnType(column);
  return (type === 'url' || type === 'email' || type === 'phone') && typeof value === 'string' ? cellHref(type, value) : null;
}

/** What opening a cell's address does, as its button says it. */
export const OPEN_LABELS: Partial<Record<ColumnType, string>> = { url: tx('Ouvrir le lien'), email: tx('Écrire'), phone: tx('Appeler') };

/** A choice as a chip on its pigment's wash, cut at the detail radius. */
export const OptionChip = memo(function OptionChipView({ option }: { option: SelectOption }) {
  const theme = useTheme();
  return (
    <Organic style={[styles.chip, { backgroundColor: theme.line[option.color].tint }]}>
      <AppText variant="label" numberOfLines={1}>
        {option.name}
      </AppText>
    </Organic>
  );
});

const styles = StyleSheet.create({
  chip: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 2, ...corners(SHAPES.detail) },
});
