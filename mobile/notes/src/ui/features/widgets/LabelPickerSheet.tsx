/** "Quel label ?": the labels as tags, each with how many notes wear it; a new one can be made right here. */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { createLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Button, Icon, LabelTag, ListRow, Sheet, SheetScroll, TextField } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

export interface LabelPickerSheetProps {
  readonly visible: boolean;
  /** The label shown now, ticked. */
  readonly current: string | null;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly onPick: (labelId: string) => void;
}

export function LabelPickerSheet({ visible, current, title, onDismiss, onPick }: LabelPickerSheetProps) {
  const theme = useTheme();
  const labels = useLibraryStore(s => s.labels);
  const order = useLibraryStore(s => s.labelOrder);
  const notes = useLibraryStore(s => s.notes);
  const [name, setName] = useState('');
  // As the label's view counts them: the bin and the archive left out.
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const note of Object.values(notes)) {
      if (note.deletedAt !== null || note.trashedAt !== null || note.archived) continue;
      for (const id of note.labelIds) out.set(id, (out.get(id) ?? 0) + 1);
    }
    return out;
  }, [notes]);

  const pick = (id: string) => {
    onDismiss();
    if (id !== current) onPick(id);
  };
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName('');
    pick(createLabel(trimmed));
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        {order.length === 0 ? (
          <AppText variant="meta" style={styles.empty}>
            {t('Aucun label pour l’instant : nommez le premier.')}
          </AppText>
        ) : null}
        {order.map(id => {
          const label = labels[id];
          if (!label) return null;
          return (
            <ListRow
              key={id}
              title={label.name}
              supporting={plural(counts.get(id) ?? 0, 'note')}
              leading={
                <View style={styles.tag}>
                  <LabelTag color={label.color} size={26} />
                </View>
              }
              trailing={id === current ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
              onPress={() => pick(id)}
            />
          );
        })}
        <View style={styles.create}>
          <View style={styles.flex}>
            <TextField value={name} onChangeText={setName} placeholder={t('Nouveau label')} returnKeyType="done" onSubmitEditing={create} maxLength={60} accessibilityLabel={t('Nom du nouveau label')} />
          </View>
          <Button kind="tonal" label={t('Créer')} icon="plus" disabled={!name.trim()} onPress={create} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  empty: { marginHorizontal: 8, marginBottom: 8 },
  tag: { width: 34, alignItems: 'center' },
  create: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginHorizontal: 8 },
  flex: { flex: 1 },
});
