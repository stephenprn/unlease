/** A note's labels: the field filters them, and creates one when nothing matches (as in Keep). */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { createLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EmptyLine, Icon, LabelCheck, ListRow, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export function LabelsSheet({ visible, selected, onDismiss, onChange }: { visible: boolean; selected: readonly string[]; onDismiss: () => void; onChange: (ids: string[]) => void }) {
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (visible) setFilter('');
  }, [visible]);

  const shown = useMemo(() => order.filter(id => labels[id] && foldText(labels[id]!.name).includes(foldText(filter.trim()))), [order, labels, filter]);
  const exact = order.some(id => labels[id] && foldText(labels[id]!.name) === foldText(filter.trim()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(l => l !== id) : [...selected, id]);
  const wanted = filter.trim() !== '' && !exact;
  const create = () => {
    const id = createLabel(filter);
    onChange([...selected, id]);
    setFilter('');
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Labels')} tall>
      <View style={styles.field}>
        {/* The keyboard's key creates the label typed when none bears its name, as Entrée on the web. */}
        <TextField
          value={filter}
          onChangeText={setFilter}
          placeholder={t('Chercher ou créer un label')}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (wanted) create();
          }}
        />
      </View>
      <SheetScroll top={false}>
        {wanted ? (
          // A list row's anatomy (`ListRow`) in link ink: the plus in the tags' slot, the words on their column.
          <Tappable onPress={create} style={styles.row}>
            <View style={styles.mark}>
              <Icon name="plus" size={24} color={theme.color.link} />
            </View>
            <AppText variant="body" color={theme.color.link} style={styles.name}>
              {t('Créer « {label} »', { label: filter.trim() })}
            </AppText>
          </Tappable>
        ) : null}
        {shown.map(id => {
          const label = labels[id]!;
          const checked = selected.includes(id);
          // The label's own tag is the checkbox: outlined when off, filled in its gouache when on.
          return (
            <ListRow
              key={id}
              title={label.name}
              leading={
                <View style={styles.mark}>
                  <LabelCheck color={label.color} checked={checked} />
                </View>
              }
              onPress={() => toggle(id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            />
          );
        })}
        {order.length === 0 && !filter ? <EmptyLine glyph="tag" text={t('Aucun label pour l’instant. Tapez un nom pour en créer un.')} slot={24} gap={16} style={styles.empty} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // On the sheet's column, under its title.
  field: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  // `ListRow`'s numbers: its press 6 in, the mark in a 24 slot, the words 16 after it.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
  // The tag (26) centred on the rows' 24 slot, so every row's words start on one column.
  mark: { width: 24, alignItems: 'center' },
  name: { flex: 1 },
  // The tag in the rows' slot, the words on their column.
  empty: { paddingHorizontal: SHEET_INSET, paddingVertical: 12 },
});
