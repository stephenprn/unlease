/** "Quel label ?": the labels as tags, each with how many notes wear it; a new one can be made right here. */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { labelKey } from '@unlease/notes/models/entities';
import { createLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { EmptyLine, Icon, LabelTag, ListRow, NewItemField, Sheet, SHEET_INSET, SheetScroll } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

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
    // A name already worn picks that label rather than making a twin.
    const worn = Object.values(labels).find(label => !!label && label.deletedAt === null && labelKey(label.name) === labelKey(trimmed));
    pick(worn ? worn.id : createLabel(trimmed));
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        {order.length === 0 ? <EmptyLine glyph="tag" text={t('No labels yet: name the first one.')} slot={24} gap={16} style={styles.empty} /> : null}
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
                  <LabelTag color={label.color} size={24} />
                </View>
              }
              trailing={id === current ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
              onPress={() => pick(id)}
            />
          );
        })}
        {/* On the rows' columns, its ✓ inside it: the field and its action one height. */}
        <NewItemField value={name} onChangeText={setName} onSubmit={create} placeholder={tc('notes', 'New label')} accessibilityLabel={tc('notes', 'New label’s name')} submitLabel={t('Create')} maxLength={60} icon="tag" style={styles.create} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  // Under the sheet's title, its glyph in the rows' slot, its words on their column.
  empty: { marginHorizontal: SHEET_INSET, marginBottom: 8 },
  // The tag in the rows' 24 slot, so the names start on the rows' words.
  tag: { width: 24, alignItems: 'center' },
  create: { marginTop: 8 },
});
