/**
 * The picked notes' labels, as the web's popover: each tag is its checkbox, ticked when every picked
 * note wears it, « 2 sur 5 » when some do; a press puts it on all of them, or takes it off all.
 * The selection stays, so several labels can be changed in a row; each change is its own undo.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { setLabelOn } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, LabelCheck, ListRow, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export function BulkLabelsSheet({ visible, ids, onDismiss }: { visible: boolean; ids: readonly string[]; onDismiss: () => void }) {
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const notes = useLibraryStore(s => s.notes);
  const live = order.map(id => labels[id]).filter(label => !!label && label.deletedAt === null);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Labels des notes sélectionnées')}>
      <SheetScroll>
        {live.length === 0 ? (
          <AppText variant="meta" style={styles.empty}>
            {t('Aucun label. Créez-en depuis la page Labels.')}
          </AppText>
        ) : (
          live.map(label => {
            const wearing = ids.filter(id => notes[id]?.labelIds.includes(label!.id)).length;
            const all = wearing === ids.length && ids.length > 0;
            const some = wearing > 0 && !all;
            return (
              <ListRow
                key={label!.id}
                title={label!.name}
                leading={
                  <View style={styles.mark}>
                    <LabelCheck color={label!.color} checked={all} />
                  </View>
                }
                trailing={
                  some ? (
                    <AppText variant="meta" color={theme.color.inkMuted}>
                      {t('{count} sur {total}', { count: wearing, total: ids.length })}
                    </AppText>
                  ) : undefined
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: all ? true : some ? 'mixed' : false }}
                onPress={() => {
                  const undo = setLabelOn(ids, label!.id, !all);
                  showSnack(all ? t('« {name} » retiré', { name: label!.name }) : t('« {name} » ajouté', { name: label!.name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
                }}
              />
            );
          })
        )}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The tag (26) centred on a list row's 24 slot, as the note's own labels sheet lays it.
  mark: { width: 24, alignItems: 'center' },
  // On the sheet's title.
  empty: { paddingHorizontal: SHEET_INSET, paddingVertical: 12 },
});
