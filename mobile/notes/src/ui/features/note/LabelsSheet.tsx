/** A note's labels: the field filters them, and creates one when nothing matches (as in Keep). */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { createLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Icon, LabelCheck, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

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

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Labels')} tall>
      <View style={styles.field}>
        <TextField value={filter} onChangeText={setFilter} placeholder={t('Chercher ou créer un label')} autoCorrect={false} />
      </View>
      <SheetScroll>
        {filter.trim() && !exact ? (
          <Tappable
            onPress={() => {
              const id = createLabel(filter);
              onChange([...selected, id]);
              setFilter('');
            }}
            style={styles.row}
          >
            <View style={styles.box}>
              <Icon name="plus" size={20} color={theme.color.link} />
            </View>
            <AppText variant="body" color={theme.color.link}>{t('Créer « {label} »', { label: filter.trim() })}</AppText>
          </Tappable>
        ) : null}
        {shown.map(id => {
          const label = labels[id]!;
          const checked = selected.includes(id);
          // The label's own tag is the checkbox: outlined when off, filled in its gouache when on.
          return (
            <Tappable key={id} onPress={() => toggle(id)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label.name}>
              <View style={styles.box}>
                <LabelCheck color={label.color} checked={checked} />
              </View>
              <AppText variant="body" numberOfLines={1} style={styles.name}>
                {label.name}
              </AppText>
            </Tappable>
          );
        })}
        {order.length === 0 && !filter ? (
          <AppText variant="meta" style={styles.empty}>
            {t('Aucun label pour l’instant. Tapez un nom pour en créer un.')}
          </AppText>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 8, paddingBottom: 8 },
  // A tab-shaped press inside the sheet, as every list row.
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingRight: 12, ...corners(SHAPES.tab) },
  box: { width: 44, alignItems: 'center' },
  name: { flex: 1 },
  empty: { padding: 12 },
});
