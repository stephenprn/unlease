/**
 * A table column's settings, from its head: its name, its type (its cells converted as it
 * changes), a number's unit, a select's choices (renamed, recoloured, removed, added), its place,
 * a column after it, and its removal, last, with the way back on the slip.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { COLUMN_TYPE_NAMES, COLUMN_TYPES, TABLE_LIMITS, type SelectOption, type TableColumn } from '@unlease/notes/models/blocks';
import { LINE_COLORS, LINE_COLOR_NAMES } from '@unlease/design/colors';
import { createId } from '@unlease/core/services/ids';
import { columnType } from '@unlease/notes/services/table';
import { useLibraryStore } from '@app/store/libraryStore';
import { addColumn, changeColumnType, deleteColumn, moveColumn, setColumnOptions, updateColumn } from '@app/store/pages';
import { commit } from '@app/store/pageHistory';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Icon, IconButton, ListRow, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { LineColorPicker } from '../lines/LineColorPicker';
import { COLUMN_ICONS } from './TableParts';
import { openTableSheet, type TableSheetRequest } from './TableSheetStore';

type ColumnRequest = Extract<TableSheetRequest, { kind: 'column' }>;

/** The column as the library holds it now (a sheet may outlive it). */
const liveColumn = (table: string, column: string): TableColumn | undefined => useLibraryStore.getState().blocks[table]?.columns.find(entry => entry.id === column);

/** A field that saves what is typed when it is left, or when its sheet goes while it is still being typed in. */
function CommitField({ initial, onCommit, ...rest }: Omit<React.ComponentProps<typeof TextField>, 'value' | 'defaultValue' | 'onChangeText' | 'onEndEditing'> & { initial: string; onCommit: (text: string) => void }) {
  const draft = useRef(initial);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => () => commitRef.current(draft.current), []);
  return (
    <TextField
      {...rest}
      defaultValue={initial}
      onChangeText={text => {
        draft.current = text;
      }}
      onEndEditing={() => commitRef.current(draft.current)}
    />
  );
}

/** A column and its cells gone, with the way back: the columns and those cells written back as one step. */
function deleteColumnWithUndo(page: string, table: string, column: TableColumn): void {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  const columns = blocks[table]?.columns ?? [];
  const cells = (blocksByParent[table] ?? []).flatMap(id => {
    const row = blocks[id];
    return row && column.id in row.cells ? [{ id, cells: row.cells }] : [];
  });
  deleteColumn(page, table, column.id);
  showSnack(
    t('Colonne « {name} » supprimée', { name: column.name }),
    {
      label: tc('undo', 'Annuler'),
      run: () =>
        commit(page, [
          { type: 'block', id: table, patch: { columns: columns.map(entry => ({ ...entry })) } },
          ...cells.map(row => ({ type: 'block' as const, id: row.id, patch: { cells: { ...row.cells } } })),
        ]),
    },
    { tone: 'success' },
  );
}

/** A select's choices: each its colour (a wash pebble edged in its pigment), its name, its removal; then a new one. */
function OptionsEditor({ page, table, column }: { page: string; table: string; column: TableColumn }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const options = column.options ?? [];
  const [painting, setPainting] = useState<string | null>(null);
  const save = (next: readonly SelectOption[]) => setColumnOptions(page, table, column.id, next);
  return (
    <View style={styles.group}>
      <AppText variant="section" style={styles.heading}>
        {t('Options')}
      </AppText>
      {options.map((option, index) => (
        <View key={option.id}>
          <View style={styles.optionRow}>
            <Tappable
              accessibilityLabel={t('Couleur de {name} : {color}', { name: option.name, color: LINE_COLOR_NAMES[option.color] })}
              accessibilityState={{ expanded: painting === option.id }}
              onPress={() => setPainting(painting === option.id ? null : option.id)}
              pebble={index}
              style={[styles.swatch, { backgroundColor: theme.line[option.color].tint, borderColor: theme.line[option.color].fill }]}
            />
            <View style={styles.optionName}>
              <CommitField
                initial={option.name}
                accessibilityLabel={t('Nom de l’option')}
                maxLength={100}
                returnKeyType="done"
                onCommit={text => {
                  const name = text.trim().slice(0, 100);
                  const live = liveColumn(table, column.id)?.options ?? [];
                  const current = live.find(other => other.id === option.id);
                  if (name && current && name !== current.name) setColumnOptions(page, table, column.id, live.map(other => (other.id === option.id ? { ...other, name } : other)));
                }}
              />
            </View>
            <IconButton icon="close" label={t('Supprimer l’option {name}', { name: option.name })} size={20} shape={index + 1} onPress={() => save(options.filter(other => other.id !== option.id))} />
          </View>
          {painting === option.id ? (
            <View style={styles.palette}>
              <LineColorPicker
                value={option.color}
                onChange={color => {
                  if (color) save(options.map(other => (other.id === option.id ? { ...other, color } : other)));
                  setPainting(null);
                }}
              />
            </View>
          ) : null}
        </View>
      ))}
      <Button kind="text" icon="plus" label={t('Ajouter une option')} onPress={() => save([...options, { id: createId(), name: `Option ${options.length + 1}`, color: LINE_COLORS[options.length % LINE_COLORS.length]! }])} />
    </View>
  );
}

function ColumnEditor({ request, column, index, count, onDone }: { request: ColumnRequest; column: TableColumn; index: number; count: number; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const type = columnType(column);
  const { page, table } = request;
  return (
    <SheetScroll contentContainerStyle={styles.body}>
      <CommitField
        label={t('Nom')}
        initial={column.name}
        maxLength={TABLE_LIMITS.name}
        returnKeyType="done"
        onCommit={text => {
          const name = text.trim();
          const live = liveColumn(table, column.id);
          if (name && live && name !== live.name) updateColumn(page, table, column.id, { name });
        }}
      />
      {type === 'number' ? (
        <CommitField
          label={t('Unité')}
          placeholder="€, kg, %, min…"
          initial={column.unit ?? ''}
          maxLength={TABLE_LIMITS.unit}
          returnKeyType="done"
          onCommit={text => {
            const unit = text.trim();
            const live = liveColumn(table, column.id);
            if (live && unit !== (live.unit ?? '')) updateColumn(page, table, column.id, { unit: unit || undefined });
          }}
        />
      ) : null}
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('Type de la colonne')}>
        <AppText variant="section" style={styles.heading}>
          {t('Type')}
        </AppText>
        {COLUMN_TYPES.map(choice => (
          <Tappable key={choice} accessibilityRole="radio" accessibilityState={{ checked: choice === type }} accessibilityLabel={COLUMN_TYPE_NAMES[choice]} onPress={() => changeColumnType(page, table, column.id, choice)} style={styles.typeRow}>
            <Icon name={COLUMN_ICONS[choice]} size={22} color={theme.color.ink} />
            <AppText variant={choice === type ? 'bodyStrong' : 'body'} style={styles.typeName}>
              {COLUMN_TYPE_NAMES[choice]}
            </AppText>
            {choice === type ? <Icon name="check" size={20} color={theme.color.focus} /> : null}
          </Tappable>
        ))}
      </View>
      {type === 'select' || type === 'multi' ? <OptionsEditor page={page} table={table} column={column} /> : null}
      <View style={styles.group}>
        <AppText variant="section" style={styles.heading}>
          {t('Colonne')}
        </AppText>
        <ListRow
          icon="plus"
          title={t('Insérer une colonne à droite')}
          onPress={() => {
            const added = addColumn(page, table, column.id, 'text');
            if (added) openTableSheet({ kind: 'column', page, table, column: added });
          }}
        />
        {index > 0 ? <ListRow icon="back" title={t('Déplacer à gauche')} onPress={() => moveColumn(page, table, column.id, index - 1)} /> : null}
        {index < count - 1 ? <ListRow icon="arrowRight" title={t('Déplacer à droite')} onPress={() => moveColumn(page, table, column.id, index + 1)} /> : null}
        {count > 1 ? (
          <ListRow
            icon="trash"
            title={t('Supprimer la colonne')}
            danger
            onPress={() => {
              onDone();
              deleteColumnWithUndo(page, table, column);
            }}
          />
        ) : null}
      </View>
    </SheetScroll>
  );
}

function ColumnSheetComponent({ visible, request, onDismiss }: { visible: boolean; request: ColumnRequest | null; onDismiss: () => void }) {
  const columns = useLibraryStore(s => (request ? s.blocks[request.table]?.columns : undefined));
  const index = columns && request ? columns.findIndex(entry => entry.id === request.column) : -1;
  const column = index >= 0 ? columns![index] : undefined;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Colonne')} tall>
      {request && column ? <ColumnEditor key={column.id} request={request} column={column} index={index} count={columns!.length} onDone={onDismiss} /> : null}
    </Sheet>
  );
}

const makeStyles = (_t: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: 4, paddingBottom: 8 },
    group: { gap: 2 },
    heading: { marginLeft: 12, marginBottom: 4 },
    typeRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 6, paddingHorizontal: 10, ...corners(SHAPES.tab) },
    typeName: { flex: 1 },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6 },
    // A colour is a pebble of the wash, edged in its pigment.
    swatch: { width: 36, height: 36, margin: 6, borderWidth: 2 },
    optionName: { flex: 1 },
    palette: { paddingHorizontal: 6, paddingVertical: 8 },
  });

export const ColumnSheet = memo(ColumnSheetComponent);
