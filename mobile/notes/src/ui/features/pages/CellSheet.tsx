/**
 * A table cell, opened from the bottom of the screen: a field for words, a number, a link, an
 * e-mail or a telephone (a strict type takes only what fits it: Enregistrer says what it expects
 * until it does), a month to pick a day from, or a select's choices, where a new one is made from
 * what is typed. A box never opens: it ticks in place.
 */
import React, { memo, useMemo, useState } from 'react';
import { Linking, StyleSheet, View, type KeyboardTypeOptions } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import type { CellValue, ColumnType, SelectOption, TableColumn } from '@unlease/notes/models/blocks';
import { LINE_COLORS } from '@unlease/design/colors';
import { createId } from '@unlease/core/services/ids';
import { foldText } from '@unlease/core/services/search';
import { CELL_FORMATS, columnType, isoDay, parseDay, readCellInput } from '@unlease/notes/services/table';
import { useLibraryStore } from '@app/store/libraryStore';
import { setCell, setColumnOptions } from '@app/store/pages';

import { AppText, Button, Icon, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { MonthCalendar } from './MonthCalendar';
import { cellAddress, chosenOptions, draftOf, OPEN_LABELS, OptionChip } from './TableParts';
import type { TableSheetRequest } from './TableSheetStore';

type CellRequest = Extract<TableSheetRequest, { kind: 'cell' }>;

const KEYBOARDS: Partial<Record<ColumnType, KeyboardTypeOptions>> = { number: 'decimal-pad', email: 'email-address', url: 'url', phone: 'phone-pad' };

/** Nothing changed: no write, no undo step. */
function unchanged(next: CellValue, value: CellValue | undefined): boolean {
  return next === value || (next === '' && (value === undefined || value === null)) || (next === null && value === undefined);
}

/** Words, a number, a link, an e-mail or a telephone, typed. */
function FieldEditor({ request, column, value, onDone }: { request: CellRequest; column: TableColumn; value: CellValue | undefined; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const type = columnType(column);
  const format = CELL_FORMATS[type];
  const [draft, setDraft] = useState(() => draftOf(type, value, column));
  const [refused, setRefused] = useState(false);
  const address = cellAddress(column, value);
  const save = () => {
    const input = readCellInput(type, draft);
    if (!input.ok) {
      setRefused(true);
      return;
    }
    if (!unchanged(input.value, value)) setCell(request.page, request.row, column.id, input.value);
    onDone();
  };
  return (
    <View style={styles.body}>
      <TextField
        autoFocus
        value={draft}
        onChangeText={text => {
          setDraft(text);
          setRefused(false);
        }}
        multiline={type === 'text'}
        keyboardType={KEYBOARDS[type] ?? 'default'}
        autoCapitalize={type === 'text' ? 'sentences' : 'none'}
        autoCorrect={type === 'text'}
        returnKeyType={type === 'text' ? 'default' : 'done'}
        submitBehavior={type === 'text' ? 'newline' : 'submit'}
        onSubmitEditing={type === 'text' ? undefined : save}
        placeholder={format ? t('Exemple : {example}', { example: format.example }) : t('Vide')}
        error={refused && format ? t('Ce n’est pas {expected}. Exemple : {example}', { expected: t(format.expected), example: format.example }) : null}
        accessibilityLabel={column.name}
        style={type === 'text' ? styles.longField : null}
      />
      <View style={styles.actions}>
        {address ? <Button kind="text" icon="external" label={t(OPEN_LABELS[type] ?? tx('Ouvrir'))} onPress={() => Linking.openURL(address).catch(() => {})} /> : null}
        <View style={styles.spacer} />
        <Button label={t('Enregistrer')} onPress={save} />
      </View>
    </View>
  );
}

/** A day: a month to page through, today ringed, the chosen one on matcha. */
function DayEditor({ request, column, value, onDone }: { request: CellRequest; column: TableColumn; value: CellValue | undefined; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const chosen = typeof value === 'string' ? parseDay(value) : null;
  const today = useMemo(() => isoDay(Date.now()), []);
  const write = (next: CellValue) => {
    if (!unchanged(next, value)) setCell(request.page, request.row, column.id, next);
    onDone();
  };
  return (
    <View style={styles.body}>
      <MonthCalendar chosen={chosen} today={today} onPick={write} />
      <View style={styles.actions}>
        {chosen ? <Button kind="text" label={t('Effacer')} onPress={() => write('')} /> : null}
        <View style={styles.spacer} />
        <Button kind="tonal" label={t('Aujourd’hui')} onPress={() => write(today)} />
      </View>
    </View>
  );
}

/** A select's or a multi-select's choices: tick them, find one, or make one from what is typed. */
function OptionsEditor({ request, column, value, onDone }: { request: CellRequest; column: TableColumn; value: CellValue | undefined; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const type = columnType(column);
  const multi = type === 'multi';
  const [query, setQuery] = useState('');
  const chosen = new Set(chosenOptions(type, value));
  const options = column.options ?? [];
  const wanted = foldText(query.trim());
  const shown = options.filter(option => !wanted || foldText(option.name).includes(wanted));
  const exact = options.some(option => option.name.toLowerCase() === query.trim().toLowerCase());
  const choose = (id: string) => {
    if (!multi) {
      setCell(request.page, request.row, column.id, chosen.has(id) ? null : id);
      onDone();
      return;
    }
    setCell(request.page, request.row, column.id, chosen.has(id) ? [...chosen].filter(other => other !== id) : [...chosen, id]);
  };
  const create = () => {
    const name = query.trim().slice(0, 100);
    if (!name) return;
    const option: SelectOption = { id: createId(), name, color: LINE_COLORS[options.length % LINE_COLORS.length]! };
    setColumnOptions(request.page, request.table, column.id, [...options, option]);
    setQuery('');
    if (!multi) {
      setCell(request.page, request.row, column.id, option.id);
      onDone();
    } else {
      setCell(request.page, request.row, column.id, [...chosen, option.id]);
    }
  };
  return (
    <View style={[styles.body, styles.fill]}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={options.length > 0 ? t('Chercher ou créer une option') : t('Créer une option')}
        accessibilityLabel={t('Chercher ou créer une option')}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={() => {
          if (shown[0] && (exact || !query.trim())) choose(shown[0].id);
          else create();
        }}
        maxLength={100}
      />
      <SheetScroll contentContainerStyle={styles.options}>
        {shown.map(option => (
          <Tappable key={option.id} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: chosen.has(option.id) }} accessibilityLabel={option.name} onPress={() => choose(option.id)} style={styles.optionRow}>
            <View style={styles.optionChip}>
              <OptionChip option={option} />
            </View>
            {chosen.has(option.id) ? <Icon name="check" size={20} color={theme.color.ink} /> : null}
          </Tappable>
        ))}
        {query.trim() && !exact ? (
          <Tappable accessibilityLabel={t('Créer « {name} »', { name: query.trim() })} onPress={create} style={styles.optionRow}>
            <Icon name="plus" size={20} color={theme.color.link} />
            <AppText variant="label" color={theme.color.link} numberOfLines={1} style={styles.optionChip}>
              {t('Créer « {name} »', { name: query.trim() })}
            </AppText>
          </Tappable>
        ) : null}
        {options.length === 0 && !query.trim() ? (
          <AppText variant="meta" style={styles.hint}>
            {t('Tapez le nom d’une option pour la créer.')}
          </AppText>
        ) : null}
      </SheetScroll>
      {multi ? (
        <View style={styles.actions}>
          <View style={styles.spacer} />
          <Button label={t('Terminé')} onPress={onDone} />
        </View>
      ) : null}
    </View>
  );
}

function CellSheetComponent({ visible, request, onDismiss }: { visible: boolean; request: CellRequest | null; onDismiss: () => void }) {
  const column = useLibraryStore(s => (request ? s.blocks[request.table]?.columns.find(entry => entry.id === request.column) : undefined));
  const value = useLibraryStore(s => (request ? s.blocks[request.row]?.cells[request.column] : undefined));
  const type = column ? columnType(column) : 'text';
  const key = request ? `${request.row}:${request.column}` : '';
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={column?.name ?? ''} tall={type === 'select' || type === 'multi'}>
      {request && column ? (
        type === 'date' ? (
          <DayEditor key={key} request={request} column={column} value={value} onDone={onDismiss} />
        ) : type === 'select' || type === 'multi' ? (
          <OptionsEditor key={key} request={request} column={column} value={value} onDone={onDismiss} />
        ) : type === 'checkbox' ? null : (
          <FieldEditor key={key} request={request} column={column} value={value} onDone={onDismiss} />
        )
      ) : null}
    </Sheet>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    body: { gap: 12, paddingHorizontal: 4, paddingBottom: 4 },
    fill: { flexShrink: 1 },
    longField: { maxHeight: 220, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    spacer: { flex: 1 },
    options: { paddingVertical: 4 },
    optionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, ...corners(SHAPES.tab) },
    optionChip: { flex: 1, flexDirection: 'row' },
    hint: { paddingHorizontal: 12, paddingVertical: 8 },
  });

export const CellSheet = memo(CellSheetComponent);
