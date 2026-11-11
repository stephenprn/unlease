/** « Gérer les libellés »: create, rename, recolour, delete (undoable; a deleted label leaves every contact). The screen's pieces are the suite's (`LabelsEditor`). */
import React, { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';
import { useLabelCounts } from '@app/hooks/useContacts';
import { createLabel, deleteLabel, labelNameTaken, updateLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { EmptyState, Ground, LabelEditRow, LabelsList, LineColorPicker, NewLabelStrip, Sheet, SHEET_INSET, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const order = useLibraryStore(s => s.labelOrder);
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.labels[coloring] : undefined));

  // The keyboard would cover the colours: they are picked, not typed.
  const openColors = (id: string): void => {
    Keyboard.dismiss();
    setColoring(id);
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Libellés')} onBack={() => navigation.goBack()} />
      <NewLabelStrip
        placeholder={t('Créer un libellé')}
        accessibilityLabel={t('Nom du nouveau libellé')}
        submitLabel={t('Créer')}
        takenMessage={t('Ce libellé existe déjà : choisissez un autre nom.')}
        maxLength={CONTACT_LIMITS.labelName}
        isTaken={name => labelNameTaken(name)}
        onCreate={name => {
          createLabel(name);
        }}
      />
      <LabelsList
        order={order}
        renderRow={id => <LabelRow id={id} onColor={() => openColors(id)} onOpen={() => navigation.navigate('Contacts', { label: id })} />}
        empty={<EmptyState scene="label" title={t('Aucun libellé')} text={t('Les libellés regroupent des contacts : la famille, le travail, le club. Un contact peut en porter plusieurs.')} />}
      />
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringLabel?.name ?? t('Couleur')}>
        <View style={styles.sheet}>
          <LineColorPicker
            value={coloringLabel?.color ?? null}
            onChange={color => {
              if (coloring && color) updateLabel(coloring, { color });
              setColoring(null);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function LabelRow({ id, onColor, onOpen }: { id: string; onColor: () => void; onOpen: () => void }) {
  const label = useLibraryStore(s => s.labels[id]);
  const count = useLabelCounts()[id] ?? 0;
  if (!label) return null;
  return (
    <LabelEditRow
      name={label.name}
      color={label.color}
      maxLength={CONTACT_LIMITS.labelName}
      words={{
        color: t('Couleur de {name}', { name: label.name }),
        rename: t('Renommer {name}', { name: label.name }),
        remove: t('Supprimer {name}', { name: label.name }),
        taken: t('Ce libellé existe déjà : choisissez un autre nom.'),
      }}
      stored={() => {
        const current = useLibraryStore.getState().labels[id];
        return current && current.deletedAt === null ? current.name : null;
      }}
      isTaken={name => labelNameTaken(name, id)}
      onRename={name => updateLabel(id, { name })}
      onColor={onColor}
      onDelete={() => {
        const undo = deleteLabel(id);
        showSnack(t('Libellé « {name} » supprimé', { name: label.name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
      }}
      count={{ text: plural(count, 'contact'), label: t('Voir les contacts de {name}', { name: label.name }), onPress: onOpen }}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    // The colour sheet's swatches on its column.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  });
